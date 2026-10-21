// End-to-end API journey against a running server (npm run dev or npm start).
// Usage: BASE_URL=http://localhost:3000 npm run test:e2e
// Creates two fresh users each run (unique emails), so it is safe to re-run.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@projectconnect.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

let passed = 0;
const failures: string[] = [];

class Client {
  cookie = "";
  constructor(public name: string) {}
  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(BASE + path, {
      method,
      headers: { "content-type": "application/json", cookie: this.cookie, "x-forwarded-for": `10.0.0.${this.name.length}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    let data: any = null;
    try { data = await res.json(); } catch { /* not json */ }
    return { status: res.status, data };
  }
  get = (p: string) => this.call("GET", p);
  post = (p: string, b?: unknown) => this.call("POST", p, b ?? {});
  put = (p: string, b: unknown) => this.call("PUT", p, b);
  patch = (p: string, b: unknown) => this.call("PATCH", p, b);
  del = (p: string, b?: unknown) => this.call("DELETE", p, b);
  /** multipart upload with this client's session */
  async upload(path: string, fields: Record<string, string | Buffer>) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) typeof v === "string" ? form.append(k, v) : form.append(k, new Blob([new Uint8Array(v)], { type: "image/jpeg" }), `${k}.jpg`);
    const res = await fetch(BASE + path, { method: "POST", headers: { cookie: this.cookie, "x-forwarded-for": `10.0.0.${this.name.length}` }, body: form });
    let data: any = null;
    try { data = await res.json(); } catch { /* not json */ }
    return { status: res.status, data };
  }
}

function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ""); }
}
const section = (t: string) => console.log(`\n${t}`);

const run = Date.now().toString(36);
const answersA = { energy: 2, planning: 4, sharing: 3, conflict: 4, pace: 2, texting: 3, ambition: 3, novelty: 4, family: 3, affection: 2 };
const answersB = { energy: 2, planning: 4, sharing: 3, conflict: 3, pace: 2, texting: 3, ambition: 4, novelty: 4, family: 3, affection: 2 };

async function onboard(c: Client, email: string, gender: string, seeking: string, name: string, answers: Record<string, number>) {
  const reg = await c.post("/api/auth/register", { email, password: "Testing123", dob: "1996-04-12", acceptLegal: true, confirmAdult: true, safetyAcknowledged: true });
  check(`${c.name}: registers`, reg.status === 201, reg.data);
  check(`${c.name}: gets a dev OTP for email`, /^\d{6}$/.test(reg.data?.devOtp ?? ""), reg.data);
  const ev = await c.post("/api/auth/otp", { action: "verify", channel: "EMAIL", code: reg.data.devOtp });
  check(`${c.name}: verifies email OTP`, ev.status === 200, ev.data);
  const phone = `+91${String(Date.now()).slice(-8)}${name === "Tara" ? "11" : "22"}`;
  const ps = await c.post("/api/auth/otp", { action: "send", channel: "PHONE", phone });
  check(`${c.name}: phone OTP sent`, ps.status === 200, ps.data);
  const pv = await c.post("/api/auth/otp", { action: "verify", channel: "PHONE", code: ps.data?.devOtp });
  check(`${c.name}: verifies phone`, pv.status === 200, pv.data);

  const bad = await c.put("/api/profile", { firstName: name, gender, city: "Delhi", intent: "FRIENDS", bio: "Call me on +91 98765 43210 anytime" });
  check(`${c.name}: profile with phone number is rejected`, bad.status === 422 && bad.data?.code === "contact_in_profile", bad.data);
  const prof = await c.put("/api/profile", {
    firstName: name, gender, city: "Delhi", intent: "FRIENDS",
    bio: "Test account for the end-to-end journey. Enjoys board games, chai and long walks in Lodhi Garden.",
    education: "Master's degree", profession: "QA engineer", heightCm: 170, drinking: "SOCIAL", smoking: "NEVER", food: "VEG", exercise: "SOMETIMES", pets: "WANTS",
    interests: ["board_games", "coffee", "trekking", "reading"], prompts: [{ q: "A perfect first date for me is", a: "a slow walk and good chai" }],
  });
  check(`${c.name}: saves profile`, prof.status === 200 && prof.data.completeness > 50, prof.data);
  const pref = await c.put("/api/preferences", { interestedIn: [seeking], ageMin: 24, ageMax: 36, maxDistanceKm: 40, intents: ["FRIENDS"] });
  check(`${c.name}: saves preferences`, pref.status === 200, pref.data);
  const few = await c.put("/api/personality", { answers: { energy: 3 } });
  check(`${c.name}: rejects too few personality answers`, few.status === 422, few.data);
  const pers = await c.put("/api/personality", { answers });
  check(`${c.name}: saves personality`, pers.status === 200, pers.data);
  const v = await c.post("/api/verification");
  check(`${c.name}: starting verification hands out a random pose`, v.status === 200 && v.data.status === "CHALLENGE" && !!v.data.pose?.text && !!v.data.attemptId, v.data);
  const me = await c.get("/api/me");
  check(`${c.name}: onboarding complete`, me.data?.user?.onboardingStep === 3, me.data?.user);
  check(`${c.name}: /me never returns coordinates`, me.data?.profile && !("lat" in me.data.profile), me.data?.profile);
  return reg.data.id as string;
}

async function main() {
  console.log(`E2E against ${BASE} (run ${run})`);
  const A = new Client("UserA");
  const B = new Client("UserBB");
  const admin = new Client("Admin1");
  const anon = new Client("Anon");

  section("Guards");
  check("unauthenticated /api/me → 401", (await anon.get("/api/me")).status === 401);
  const under = await anon.post("/api/auth/register", { email: `kid-${run}@test.local`, password: "Testing123", dob: `${new Date().getFullYear() - 16}-01-01`, acceptLegal: true, confirmAdult: true, safetyAcknowledged: true });
  check("under-18 registration is blocked", under.status === 403 && under.data?.code === "underage", under.data);
  const noLegal = await anon.post("/api/auth/register", { email: `nolegal-${run}@test.local`, password: "Testing123", dob: "1995-01-01", acceptLegal: false, confirmAdult: true, safetyAcknowledged: true });
  check("registration without accepting terms is blocked", noLegal.status === 422, noLegal.data);
  const weak = await anon.post("/api/auth/register", { email: `weak-${run}@test.local`, password: "short", dob: "1995-01-01", acceptLegal: true, confirmAdult: true, safetyAcknowledged: true });
  check("weak password is rejected", weak.status === 422, weak.data);
  const terms = await anon.get("/api/legal/terms");
  check("terms are publicly readable", terms.status === 200 && terms.data.version >= 1, terms.data);

  // The older billing checks below were written for paid plans for everyone; run them with the
  // women-free-forever and men's-trial rules off. "Membership v3" near the end tests the new rules.
  const adminEarly = new Client("Admin0");
  await adminEarly.post("/api/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  await adminEarly.put("/api/admin/config", { config: { "rewards.womenFreeForever": false, "rewards.menTrialDays": 0 } });
  // …and with the old ₹1 intro offer for men, which they exercise (it's off in the real catalogue now).
  const legacyIntro = { name: `Welcome ₹1 — men (e2e ${run})`, kind: "INTRO", headline: "Try Premium for ₹1", badge: "Welcome offer", planCode: "PREMIUM", country: "IN", genders: ["MAN"], audience: "NEW", priceMinor: 100, days: 15, priority: 10, active: true };
  const legacyIntroId = (await adminEarly.post("/api/admin/billing/offers", legacyIntro)).data?.offer?.id;

  section("User A: register → profile → verify → preferences");
  const aId = await onboard(A, `tara-${run}@test.local`, "WOMAN", "MAN", "Tara", answersA);
  section("User B: register → profile → verify");
  const bId = await onboard(B, `kabir-${run}@test.local`, "MAN", "WOMAN", "Kabir", answersB);

  section("Admin verifies both selfies");
  const al = await admin.post("/api/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  check("admin logs in", al.status === 200 && al.data.next === "/admin", al.data);
  for (const id of [aId, bId]) {
    const r = await admin.post(`/api/admin/users/${id}`, { action: "VERIFY", reason: "Selfie matches profile photos (e2e)" });
    check(`admin verifies ${id.slice(0, 6)}`, r.status === 200, r.data);
  }
  check("regular user cannot open admin APIs", (await A.get("/api/admin/stats")).status === 403);

  section("Discovery");
  const disc = await A.get("/api/discovery?mode=intent");
  const cardB = disc.data?.cards?.find((c: any) => c.id === bId);
  check("A discovers B in intent mode", !!cardB, { count: disc.data?.cards?.length });
  if (cardB) {
    check("card shows a compatibility score", cardB.score >= 1 && cardB.score <= 99, cardB.score);
    check("card explains the score", Array.isArray(cardB.reasons) && cardB.reasons.length > 0, cardB.reasons);
    check("card hides email, phone, coordinates and DOB", !("email" in cardB) && !("lat" in cardB) && !("dob" in cardB) && !("phone" in cardB), Object.keys(cardB));
    check("card shows coarse distance only", /km|area/.test(cardB.distance), cardB.distance);
    check("card shows verified badge", cardB.verified === true);
  }
  for (const mode of ["recommended", "nearby", "compatibility", "interests"]) {
    const r = await A.get(`/api/discovery?mode=${mode}`);
    check(`discovery mode ${mode} responds`, r.status === 200 && Array.isArray(r.data.cards), r.data);
  }

  section("Like → mutual match");
  const l1 = await A.post("/api/likes", { toId: bId, kind: "LIKE", note: "Board games and chai? Strong start." });
  check("A likes B (no match yet)", l1.status === 200 && l1.data.matched === false, l1.data);
  check("duplicate like is rejected", (await A.post("/api/likes", { toId: bId, kind: "LIKE" })).status === 409);
  const bl = await B.get("/api/likes");
  check("B sees 1 like (hidden on free plan)", bl.data?.total === 1 && bl.data.hidden === 1 && bl.data.canSeeAll === false, bl.data);
  const l2 = await B.post("/api/likes", { toId: aId, kind: "LIKE" });
  check("B likes A → match created", l2.status === 200 && l2.data.matched === true && !!l2.data.matchId, l2.data);
  const matchId = l2.data?.matchId;
  const nA = await A.get("/api/notifications");
  check("A is notified of the match", nA.data?.notifications?.some((n: any) => n.type === "MATCH"), nA.data);
  const nB = await B.get("/api/notifications");
  check("B is notified of the match", nB.data?.notifications?.some((n: any) => n.type === "MATCH"));

  section("Match detail & chat");
  const md = await A.get(`/api/matches/${matchId}`);
  check("A opens match with compatibility summary", md.status === 200 && md.data.match.score > 0 && md.data.other.reasons.length > 0, md.data);
  check("conversation starters are suggested", md.data?.starters?.length >= 2, md.data?.starters);
  const ml = await A.get("/api/matches");
  check("match appears in A's list", ml.data?.matches?.some((m: any) => m.id === matchId));
  const outsider = new Client("Outsider");
  await outsider.post("/api/auth/login", { email: "user1@test.local", password: "Demo!2026" });
  check("a stranger cannot read the conversation", (await outsider.get(`/api/matches/${matchId}/messages`)).status === 404);

  const m1 = await A.post(`/api/matches/${matchId}/messages`, { body: "Hi Kabir! Which board game do you always win?" });
  check("A sends a message", m1.status === 201, m1.data);
  const bMsgs = await B.get(`/api/matches/${matchId}/messages`);
  check("B receives it", bMsgs.data?.messages?.some((m: any) => m.body?.includes("board game")), bMsgs.data);
  const aMsgs = await A.get(`/api/matches/${matchId}/messages`);
  check("A sees read receipt", aMsgs.data?.messages?.find((m: any) => m.mine)?.read === true, aMsgs.data?.messages);
  const m2 = await B.post(`/api/matches/${matchId}/messages`, { body: "Catan, obviously. You?" });
  check("B replies", m2.status === 201);
  const scam = await B.post(`/api/matches/${matchId}/messages`, { body: "I can double your money with a crypto investment, guaranteed returns. Add me on whatsapp" });
  check("scam-like message is flagged", scam.status === 201 && scam.data.flagged === true, scam.data);
  const aView = await A.get(`/api/matches/${matchId}/messages`);
  const flagged = aView.data?.messages?.find((m: any) => m.body?.includes("crypto"));
  check("recipient sees a safety warning on it", typeof flagged?.warning === "string" && flagged.warning.length > 10, flagged);
  for (let i = 0; i < 3; i++) await B.post(`/api/matches/${matchId}/messages`, { body: `follow-up ${i}` });
  const capped = await B.post(`/api/matches/${matchId}/messages`, { body: "are you there?" });
  check("unanswered-message cap applies", capped.status === 429 && capped.data.code === "awaiting_reply", capped.data);
  const del = await A.del(`/api/messages/${m1.data.id}`);
  check("A deletes own message", del.status === 200);
  check("B cannot delete A's message", (await B.del(`/api/messages/${m1.data.id}`)).status === 404);

  section("Date planner");
  const later = new Date(Date.now() + 3 * 86400_000).toISOString();
  const priv = await A.post(`/api/matches/${matchId}/dates`, { kind: "COFFEE", place: "my place in Saket", startsAt: later });
  check("private location is refused for a date", priv.status === 422 && priv.data.code === "private_place", priv.data);
  const past = await A.post(`/api/matches/${matchId}/dates`, { kind: "COFFEE", place: "Blue Tokai, Champa Gali", startsAt: new Date(Date.now() - 3600_000).toISOString() });
  check("date in the past is refused", past.status === 422, past.data);
  const dp = await A.post(`/api/matches/${matchId}/dates`, { kind: "COFFEE", place: "Blue Tokai, Champa Gali", startsAt: later, note: "Saturday afternoon?" });
  check("A proposes a coffee date", dp.status === 201, dp.data);
  check("A cannot confirm own proposal", (await A.patch(`/api/dates/${dp.data.id}`, { action: "confirm" })).status === 403);
  const conf = await B.patch(`/api/dates/${dp.data.id}`, { action: "confirm" });
  check("B confirms the date", conf.status === 200, conf.data);
  const md2 = await A.get(`/api/matches/${matchId}`);
  check("date shows as confirmed", md2.data?.dates?.[0]?.status === "CONFIRMED", md2.data?.dates);

  section("Report, block, unmatch");
  const rep = await A.post("/api/reports", { reportedId: bId, category: "SCAM", details: "Asked me to invest in crypto", messageId: scam.data.id, alsoBlock: true });
  check("A reports B's message (and blocks)", rep.status === 201 && rep.data.blocked === true, rep.data);
  check("match is closed after block", (await B.get(`/api/matches/${matchId}`)).status === 410);
  check("B can no longer message A", (await B.post(`/api/matches/${matchId}/messages`, { body: "hello?" })).status === 410);
  const discB = await B.get("/api/discovery?mode=intent");
  check("A no longer appears to B", !discB.data?.cards?.some((c: any) => c.id === aId));

  section("Admin: dashboard, users, reports, moderation, audit");
  const st = await admin.get("/api/admin/stats");
  check("dashboard stats load", st.status === 200 && st.data.users.total > 0 && st.data.engagement.matches > 0, st.data?.users);
  const us = await admin.get(`/api/admin/users?q=kabir-${run}`);
  check("admin finds B by email search", us.data?.users?.[0]?.id === bId, us.data);
  const ud = await admin.get(`/api/admin/users/${bId}`);
  check("user detail shows reports against B", ud.data?.reportsAgainst?.length >= 1, ud.data?.reportsAgainst);
  const am = await admin.get("/api/admin/matches");
  check("admin sees the match (metadata only)", am.data?.matches?.some((m: any) => m.id === matchId));
  const rq = await admin.get("/api/admin/reports");
  const myReport = rq.data?.reports?.find((r: any) => r.id === rep.data.id);
  check("report is in the moderation queue with HIGH priority", myReport?.priority === "HIGH", myReport);
  check("automated scam report also queued", rq.data?.reports?.some((r: any) => r.automated && r.reportedId === bId));
  const rd = await admin.get(`/api/admin/reports/${rep.data.id}`);
  check("report shows conversation evidence", rd.data?.evidence?.some((e: any) => e.highlighted && e.fromReported), rd.data?.evidence?.length);
  const sus = await admin.post(`/api/admin/users/${bId}`, { action: "SUSPEND", reason: "Investment scam messages (e2e)", reportId: rep.data.id });
  check("admin suspends B", sus.status === 200, sus.data);
  check("suspended B cannot like", (await B.post("/api/likes", { toId: aId, kind: "LIKE" })).status === 403);
  const res = await admin.post(`/api/admin/reports/${rep.data.id}`, { status: "ACTIONED", resolution: "Suspended for scam messages" });
  check("admin closes the report", res.status === 200, res.data);
  const ban = await admin.post(`/api/admin/users/${bId}`, { action: "BAN", reason: "Confirmed scam (e2e)" });
  check("admin bans B", ban.status === 200);
  check("banned B's session is revoked", (await B.get("/api/me")).status === 401);
  const bLogin = await B.post("/api/auth/login", { email: `kabir-${run}@test.local`, password: "Testing123" });
  check("banned B cannot log in", bLogin.status === 403, bLogin.data);
  const audit = await admin.get("/api/admin/audit");
  const actions = audit.data?.logs?.map((l: any) => l.action) ?? [];
  check("audit log records moderation", ["moderation.ban", "moderation.suspend", "report.actioned"].every((x) => actions.includes(x)), actions.slice(0, 15));

  section("Config & legal");
  const cfg = await admin.get("/api/admin/config");
  check("admin reads matching weights", cfg.data?.config?.["matching.weights"]?.intent >= 0);
  const legal = await admin.get("/api/admin/legal");
  const terms2 = legal.data?.documents?.find((d: any) => d.slug === "terms");
  const published = terms2?.versions?.find((v: any) => v.status === "PUBLISHED");
  check("legal center lists versions with acceptance counts", published?.acceptances >= 2, published);
  const draft = await admin.post("/api/admin/legal", { documentId: terms2.id, body: `# Terms of Service\n\nE2E draft ${run} — placeholder text for testing.` });
  check("admin creates a new terms draft", draft.status === 201, draft.data);
  await admin.post(`/api/admin/legal/${draft.data.id}`, { action: "submit_review" });
  const selfPub = await admin.post(`/api/admin/legal/${draft.data.id}`, { action: "publish" });
  check("author cannot publish own draft (four-eyes)", selfPub.status === 403, selfPub.data);
  await admin.post(`/api/admin/legal/${draft.data.id}`, { action: "back_to_draft" });


  section("Subscriptions (mock provider)");
  const plans = await A.get("/api/plans");
  const premium = plans.data?.plans?.find((p: any) => p.code === "PREMIUM");
  check("A sees plans priced for India", premium?.price?.currency === "INR", premium);
  const sub = await A.post("/api/subscriptions", { action: "subscribe", priceId: premium.price.id });
  check("A subscribes (mock)", sub.status === 201 && sub.data.provider === "MOCK", sub.data);
  const meA = await A.get("/api/me");
  check("premium entitlements apply", meA.data?.features?.seeWhoLiked === true, meA.data?.features);
  const inc = await A.put("/api/preferences", { incognito: true });
  check("incognito needs Premium Plus", inc.status === 402, inc.data);

  section("Mobile: token auth, photos, partial profile, compatibility");
  const appEmail = `app-${run}@test.local`;
  const reg = await anon.post("/api/auth/register", { email: appEmail, password: "Testing123", dob: "1995-02-02", acceptLegal: true, confirmAdult: true, safetyAcknowledged: true, client: "app", platform: "ios" });
  check("app registration returns tokens", reg.status === 201 && reg.data.accessToken && reg.data.refreshToken, reg.data);
  const bearer = async (method: string, path: string, body?: unknown, token = reg.data.accessToken, form?: FormData) => {
    const res = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${token}`, ...(form ? {} : { "content-type": "application/json" }), "x-forwarded-for": "10.0.9.9" }, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
    let data: any = null; try { data = await res.json(); } catch { /* */ }
    return { status: res.status, data };
  };
  check("bearer token authenticates /api/me", (await bearer("GET", "/api/me")).status === 200);
  check("refresh token is rejected as a bearer token", (await bearer("GET", "/api/me", undefined, reg.data.refreshToken)).status === 401);
  const r1 = await anon.post("/api/auth/refresh", { refreshToken: reg.data.refreshToken });
  check("refresh rotates tokens", r1.status === 200 && r1.data.refreshToken !== reg.data.refreshToken, r1.data);
  const reuse = await anon.post("/api/auth/refresh", { refreshToken: reg.data.refreshToken });
  check("reusing an old refresh token is refused", reuse.status === 401);
  const afterReuse = await anon.post("/api/auth/refresh", { refreshToken: r1.data.refreshToken });
  check("reuse revokes the whole session family", afterReuse.status === 401);
  const login = await anon.post("/api/auth/token", { email: appEmail, password: "Testing123", platform: "android" });
  check("token sign-in works", login.status === 200 && !!login.data.accessToken, login.data);
  const tok = login.data.accessToken;

  const p1 = await bearer("PATCH", "/api/profile", { firstName: "Noor", gender: "WOMAN", city: "Pune", intent: "LONG_TERM" }, tok);
  check("partial profile: basics create the profile", p1.status === 200, p1.data);
  const p2 = await bearer("PATCH", "/api/profile", { interests: ["coffee", "trekking", "dogs"] }, tok);
  check("partial profile: later step keeps earlier fields", p2.status === 200, p2.data);
  const meP = await bearer("GET", "/api/me", undefined, tok);
  check("profile has both steps saved", meP.data?.profile?.firstName === "Noor" && meP.data?.profile?.interests === "coffee,trekking,dogs", meP.data?.profile);
  const pers = await bearer("PUT", "/api/personality", { answers: answersA }, tok);
  check("personality before preferences does not finish onboarding", pers.data?.onboardingStep === 1, pers.data);
  const prefs = await bearer("PUT", "/api/preferences", { interestedIn: ["MAN"], ageMin: 24, ageMax: 40, maxDistanceKm: 50 }, tok);
  check("preferences complete onboarding in any order", prefs.data?.onboardingStep === 3, prefs.data);

  const sharp = (await import("sharp")).default;
  const jpeg = await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 200, g: 140, b: 90 } } })
    .composite([{ input: Buffer.from('<svg width="900" height="1200"><circle cx="450" cy="500" r="200" fill="#2E2A6E"/><rect x="100" y="800" width="700" height="60" fill="#fff"/></svg>') }]).jpeg().toBuffer();
  const form = new FormData(); form.append("file", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "me.jpg");
  const up = await bearer("POST", "/api/photos", undefined, tok, form);
  check("photo upload is processed", up.status === 201 && up.data.photo?.blurhash && up.data.photo.width <= 1080, up.data);
  check("photo gets a quality hint", typeof up.data?.photo?.hint === "string", up.data?.photo);
  const dark = await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 10, g: 10, b: 15 } } }).jpeg().toBuffer();
  const form2 = new FormData(); form2.append("file", new Blob([new Uint8Array(dark)], { type: "image/jpeg" }), "dark.jpg");
  const up2 = await bearer("POST", "/api/photos", undefined, tok, form2);
  check("dark photo is flagged as DARK (not rejected)", up2.status === 201 && up2.data.photo?.quality === "DARK", up2.data?.photo);
  const notImg = new FormData(); notImg.append("file", new Blob([new TextEncoder().encode("hello")], { type: "image/jpeg" }), "x.jpg");
  check("non-image upload is refused", (await bearer("POST", "/api/photos", undefined, tok, notImg)).status === 422);
  const heicBytes = new Uint8Array(64); heicBytes.set(new TextEncoder().encode("\0\0\0\x18ftypheic"), 0);
  const heic = new FormData(); heic.append("file", new Blob([heicBytes], { type: "image/heic" }), "IMG_0001.HEIC");
  const heicRes = await bearer("POST", "/api/photos", undefined, tok, heic);
  check("an old app sending an iPhone HEIC photo gets a clear message", heicRes.status === 422 && heicRes.data?.code === "heic", heicRes.data);
  const media = await fetch(BASE + up.data.photo.url);
  check("signed media link serves the image", media.status === 200 && media.headers.get("content-type") === "image/webp");
  const tampered = await fetch(BASE + up.data.photo.url.replace(/sig=[^&]+/, "sig=bad"));
  check("tampered media link is refused", tampered.status === 403);
  const exifCheck = await sharp(Buffer.from(await (await fetch(BASE + up.data.photo.url)).arrayBuffer())).metadata();
  check("stored photo has no EXIF metadata", !exifCheck.exif);
  const reorder = await bearer("PATCH", "/api/photos", { order: [up2.data.photo.id, up.data.photo.id] }, tok);
  check("photos reorder (primary changes)", reorder.data?.photos?.[0]?.id === up2.data.photo.id, reorder.data);
  const delp = await bearer("DELETE", `/api/photos/${up2.data.photo.id}`, undefined, tok);
  check("photo delete renumbers the rest", delp.status === 200 && (await bearer("GET", "/api/photos", undefined, tok)).data.photos[0].position === 0);

  const disc2 = await bearer("GET", "/api/discovery?mode=recommended", undefined, tok);
  const c0 = disc2.data?.cards?.[0];
  check("discovery cards carry photos with blurhash", c0?.photos?.length > 0 && !!c0.photos[0].blurhash, c0?.photos);
  check("discovery cards carry shared interests", Array.isArray(c0?.shared), c0?.shared);
  const comp = await bearer("GET", `/api/compatibility/${c0?.id}`, undefined, tok);
  check("compatibility breakdown has five bars rounded to 5", comp.status === 200 && comp.data.bars.length === 5 && comp.data.bars.every((b: any) => b.value % 5 === 0), comp.data);
  check("compatibility hides weights", !("weights" in (comp.data ?? {})) && !("factors" in (comp.data ?? {})));
  check("compatibility for an unrelated hidden profile is refused", (await bearer("GET", `/api/compatibility/${aId}`, undefined, tok)).status === 404);
  const pass = await bearer("POST", "/api/likes", { toId: c0.id, kind: "PASS" }, tok);
  const undo = await bearer("POST", "/api/likes/undo", undefined, tok);
  check("undo restores the last pass", pass.status === 200 && undo.status === 200 && undo.data.restoredUserId === c0.id, undo.data);
  const dev = await bearer("POST", "/api/devices", { pushToken: "ExponentPushToken[e2e-test-token]", platform: "ios" }, tok);
  check("push token registers", dev.status === 201, dev.data);
  check("bad push token is refused", (await bearer("POST", "/api/devices", { pushToken: "not-a-token", platform: "ios" }, tok)).status === 422);
  const out = await anon.post("/api/auth/logout", { refreshToken: login.data.refreshToken });
  check("app sign-out revokes the refresh token", out.status === 200 && (await anon.post("/api/auth/refresh", { refreshToken: login.data.refreshToken })).status === 401);


  // -------------------------------------------------------------------------
  section("Billing: a new member in India (man)");
  const M = new Client("UserMan7");
  await onboard(M, `vikram-${run}@test.local`, "MAN", "WOMAN", "Vikram", answersB);

  section("Billing: personalised quotes (India price groups, ₹1 intro offers)");
  const envFile = (await import("node:fs")).readFileSync(".env", "utf8");
  const envVal = (k: string) => process.env[k] ?? envFile.match(new RegExp(`^${k}="?([^"\\n]*)"?`, "m"))?.[1] ?? "";
  const { createHmac } = await import("node:crypto");
  const { totpAt } = await import("../src/lib/totp");

  const catB = await M.get("/api/billing/catalogue");
  check("men don't get the free months", catB.data?.subscription?.status === "NONE", catB.data?.subscription);
  const optsB = catB.data?.plans?.find((p: any) => p.code === "PREMIUM")?.options ?? [];
  check("man in India: monthly ₹100, 3 months ₹250, 6 months ₹500, 1 year ₹1,000", JSON.stringify(optsB.map((o: any) => [o.durationDays, o.quote.regularMinor])) === JSON.stringify([[30, 10000], [90, 25000], [180, 50000], [365, 100000]]), optsB.map((o: any) => [o.durationDays, o.quote?.regularMinor]));
  check("longer plans are charged in full today (the ₹1 intro is monthly only)", optsB.filter((o: any) => o.durationDays > 31).every((o: any) => o.quote.todayMinor === o.quote.regularMinor && !o.quote.introDays), optsB.map((o: any) => o.quote?.todayMinor));
  check("yearly plan reads 'every year' and shows the monthly equivalent", /every year/.test(optsB.find((o: any) => o.durationDays === 365)?.quote.terms.join(" ") ?? "") && optsB.find((o: any) => o.durationDays === 365)?.perMonthMinor === 8219, optsB.find((o: any) => o.durationDays === 365));
  const qB = catB.data?.plans?.find((p: any) => p.code === "PREMIUM")?.quote;
  check("man in India: ₹1 today", qB?.todayMinor === 100, qB);
  check("man in India: 15-day intro, then ₹100/month", qB?.introDays === 15 && qB?.nextChargeMinor === 10000 && qB?.currency === "INR", qB);
  check("quote states the renewal price and date in words", /Then ₹100 every month, starting \d+ \w+ 20\d\d/.test((qB?.terms ?? []).join(" ")), qB?.terms);
  check("quote says how to avoid being charged", /Cancel any time before/.test((qB?.terms ?? []).join(" ")));
  const subA = await A.get("/api/billing/subscription");
  check("woman in India pays ₹50/month (no ₹1 intro: she has free months instead)", subA.data?.subscription?.status === "ACTIVE" && subA.data.subscription.nextChargeMinor === 5000, subA.data?.subscription);
  check("A's ₹50 payment is in the history with an invoice number", subA.data?.payments?.[0]?.amountMinor === 5000 && /^PC\/\d{4}-\d{2}\/\d{6}$/.test(subA.data.payments[0].invoiceNo ?? ""), subA.data?.payments);

  section("Billing: women's plans and choosing a billing period");
  const W2 = new Client("Women-Two2");
  await onboard(W2, `meera-${run}@test.local`, "WOMAN", "MAN", "Meera", answersA);
  const catW = await W2.get("/api/billing/catalogue");
  const optsW = catW.data?.plans?.find((p: any) => p.code === "PREMIUM")?.options ?? [];
  check("woman in India: ₹50/month or ₹500/year", JSON.stringify(optsW.map((o: any) => [o.durationDays, o.quote.regularMinor])) === JSON.stringify([[30, 5000], [365, 50000]]), optsW.map((o: any) => [o.durationDays, o.quote?.regularMinor]));
  check("a woman can't pick a period that isn't offered to her", (await W2.post("/api/billing/quote", { planCode: "PREMIUM", durationDays: 90 })).status === 404);
  const M3 = new Client("Man-Yearly3");
  await onboard(M3, `arjun-${run}@test.local`, "MAN", "WOMAN", "Arjun", answersB);
  const coY = await M3.post("/api/billing/checkout", { planCode: "PREMIUM", durationDays: 365, acceptTerms: true, expectedTodayMinor: 100000 });
  check("man checks out the 1-year plan for ₹1,000", coY.status === 201 && coY.data.quote.periodDays === 365 && coY.data.quote.todayMinor === 100000, coY.data);

  const qc = await M.post("/api/billing/quote", { planCode: "PREMIUM", coupon: "welcome50" });
  check("a coupon replaces the intro offer (no stacking)", qc.data?.quote?.offer === null && qc.data.quote.coupon?.code === "WELCOME50" && qc.data.quote.todayMinor === 5000, qc.data?.quote);
  const qbad = await M.post("/api/billing/quote", { planCode: "PREMIUM", coupon: "NOPE123" });
  check("an invalid coupon keeps the offer and explains why", qbad.data?.quote?.todayMinor === 100 && /isn't valid/.test(qbad.data.quote.couponError ?? ""), qbad.data?.quote);

  section("Billing: checkout, failure, retry, success");
  const noTerms = await M.post("/api/billing/checkout", { planCode: "PREMIUM", acceptTerms: false, expectedTodayMinor: 100 });
  check("checkout without accepting the terms is refused", noTerms.status === 422, noTerms.data);
  const stale = await M.post("/api/billing/checkout", { planCode: "PREMIUM", acceptTerms: true, expectedTodayMinor: 999 });
  check("checkout refuses if the price shown is out of date", stale.status === 409 && stale.data?.code === "price_changed", stale.data);
  const co1 = await M.post("/api/billing/checkout", { planCode: "PREMIUM", acceptTerms: true, expectedTodayMinor: 100, returnTo: "app" });
  check("checkout starts with the test provider and a pay link", co1.status === 201 && co1.data.provider === "MOCK" && /\/pay\/.+\?t=/.test(co1.data.payUrl), co1.data);
  const payTok = new URL(co1.data.payUrl).searchParams.get("t")!;
  const payInfo = await anon.get(`/api/billing/pay/${co1.data.paymentId}?t=${encodeURIComponent(payTok)}`);
  check("pay page shows amount and renewal terms (scoped token)", payInfo.status === 200 && payInfo.data.payment.amountMinor === 100 && payInfo.data.terms.some((t: string) => /₹100/.test(t)), payInfo.data);
  check("pay page refuses without a token", (await anon.get(`/api/billing/pay/${co1.data.paymentId}`)).status === 401);
  const fail = await anon.post("/api/billing/mock/complete", { paymentId: co1.data.paymentId, token: payTok, outcome: "fail" });
  const st1 = await M.get(`/api/billing/payments/${co1.data.paymentId}`);
  check("declined payment is recorded with a friendly reason", fail.status === 200 && st1.data?.payment?.status === "FAILED" && /declined/.test(st1.data.payment.failureReason ?? ""), st1.data);
  check("a failed payment doesn't grant Premium", (await M.get("/api/me")).data?.user?.planCode === "FREE");
  const co2 = await M.post("/api/billing/checkout", { planCode: "PREMIUM", acceptTerms: true, expectedTodayMinor: 100 });
  const ok2 = await M.post("/api/billing/mock/complete", { paymentId: co2.data?.paymentId, outcome: "success", method: "upi" });
  const st2 = await M.get(`/api/billing/payments/${co2.data?.paymentId}`);
  check("retry succeeds and Premium switches on", ok2.data?.result === "activated" && st2.data?.payment?.status === "CAPTURED" && st2.data.subscription.status === "TRIALING", st2.data);
  check("next payment is ₹100 after 15 days", st2.data?.subscription?.nextChargeMinor === 10000 && Math.round((new Date(st2.data.subscription.nextChargeAt).getTime() - Date.now()) / 86400_000) === 15, st2.data?.subscription);
  const replay = await M.post("/api/billing/mock/complete", { paymentId: co2.data?.paymentId, outcome: "success" });
  check("completing the same payment twice changes nothing", replay.data?.result !== "activated", replay.data);
  check("intro offer isn't offered again", !(await M.get("/api/billing/catalogue")).data?.plans?.some((p: any) => p.quote?.introDays), undefined);
  check("can't start a second subscription", (await M.post("/api/billing/checkout", { planCode: "PREMIUM", acceptTerms: true, expectedTodayMinor: 10000 })).status === 409);

  section("Billing: invoices");
  const inv = await fetch(`${BASE}/api/billing/invoices/${co2.data?.paymentId}`, { headers: { cookie: M.cookie } });
  check("owner downloads a PDF invoice", inv.status === 200 && inv.headers.get("content-type") === "application/pdf" && (await inv.arrayBuffer()).byteLength > 1000);
  check("someone else can't see it", (await A.get(`/api/billing/invoices/${co2.data?.paymentId}`)).status === 404);
  const link = await M.get(`/api/billing/invoices/${co2.data?.paymentId}?link=1`);
  check("short-lived invoice link works without a session", link.status === 200 && (await fetch(link.data.url)).status === 200, link.data);

  section("Billing: signed webhooks (renewal, idempotency, dispute)");
  const finance = new Client("Finance1"), finance2 = new Client("Finance22"), support = new Client("Support1"), mod = new Client("Moderat1"), security = new Client("Security1");
  for (const [c, e] of [[finance, "finance"], [finance2, "finance2"], [support, "support"], [mod, "moderator"], [security, "security"]] as const)
    check(`${e} staff logs in`, (await c.post("/api/auth/login", { email: `${e}@projectconnect.local`, password: ADMIN_PASSWORD })).status === 200);
  const plist = await finance.get(`/api/admin/billing/payments?q=${co2.data?.paymentId}`);
  const subRef = plist.data?.payments?.[0]?.gatewayRef;
  check("finance sees the payment with its gateway reference, and no card data", !!subRef && !JSON.stringify(plist.data).match(/card_number|cvv|vpa/i), plist.data?.payments?.[0]);
  const hook = async (body: unknown, eventId: string, sig?: string) => {
    const raw = JSON.stringify(body);
    const r = await fetch(`${BASE}/api/webhooks/razorpay`, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-event-id": eventId, "x-razorpay-signature": sig ?? createHmac("sha256", envVal("RAZORPAY_WEBHOOK_SECRET")).update(raw).digest("hex") }, body: raw });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const charged = (id: string) => ({ event: "subscription.charged", payload: { subscription: { entity: { id: subRef } }, payment: { entity: { id, status: "captured", amount: 10000, currency: "INR", method: "upi" } } } });
  check("webhook with a bad signature is rejected", (await hook(charged("pay_bad"), `evt_bad_${run}`, "deadbeef")).status === 400);
  const rnw1 = await hook(charged(`pay_renew_${run}`), `evt_renew_${run}`);
  const afterRenew = await M.get("/api/billing/subscription");
  check("signed renewal webhook charges ₹100 and moves to ACTIVE", rnw1.status === 200 && rnw1.data?.results?.[0] === "renewed" && afterRenew.data?.subscription?.status === "ACTIVE", { rnw1: rnw1.data, sub: afterRenew.data?.subscription });
  const r2 = await hook(charged(`pay_renew_${run}`), `evt_renew_${run}`);
  const r3 = await hook(charged(`pay_renew_${run}`), `evt_renew_other_${run}`);
  const afterDup = await M.get("/api/billing/subscription");
  check("repeated webhooks are idempotent (by event id and by payment id)", r2.data?.duplicate === true && r3.data?.results?.[0] === "duplicate" && afterDup.data.payments.filter((p: any) => p.purpose === "RENEWAL").length === 1, { r2: r2.data, r3: r3.data });
  const spoof = await hook({ event: "payment.captured", payload: { payment: { entity: { id: `pay_spoof_${run}`, status: "captured", amount: 10000, currency: "INR", method: "upi", order_id: "order_unknown", notes: { pc_payment_id: co1.data?.paymentId } } } } }, `evt_spoof_${run}`);
  check("a payment can't settle one of our checkouts by naming it in notes", spoof.data?.results?.[0] === "unmatched" && (await M.get(`/api/billing/payments/${co1.data?.paymentId}`)).data?.payment?.status === "FAILED", spoof.data);
  const pend = await hook({ event: "subscription.pending", payload: { subscription: { entity: { id: subRef } } } }, `evt_pend_${run}`);
  check("failed renewal → past due, Premium kept during grace", pend.data?.results?.[0] === "past_due" && (await M.get("/api/me")).data?.user?.planCode === "PREMIUM", pend.data);
  await hook(charged(`pay_renew2_${run}`), `evt_renew2_${run}`);
  check("a later successful charge clears past due", (await M.get("/api/billing/subscription")).data?.subscription?.status === "ACTIVE");

  section("Billing: cancel, resume, change plan");
  const can1 = await M.post("/api/billing/subscription", { action: "cancel" });
  const sAfter = (await M.get("/api/billing/subscription")).data?.subscription;
  check("cancelling is one step and keeps access until the period ends", can1.status === 200 && sAfter?.renews === false && new Date(sAfter.endsAt).getTime() > Date.now() && (await M.get("/api/me")).data?.user?.planCode === "PREMIUM", sAfter);
  check("cancelling twice is refused clearly", (await M.post("/api/billing/subscription", { action: "cancel" })).status === 404);
  const res1 = await M.post("/api/billing/subscription", { action: "resume" });
  check("auto-renew can be turned back on (test provider)", res1.status === 200 && res1.data.subscription.renews === true, res1.data);
  const chg = await M.post("/api/billing/subscription", { action: "change", planCode: "PREMIUM_PLUS" });
  check("plan change is scheduled for the next renewal at the new price", chg.data?.subscription?.pendingPlanCode === "PREMIUM_PLUS" && chg.data.subscription.nextChargeMinor === 24900, chg.data?.subscription);
  await M.post("/api/billing/subscription", { action: "change", planCode: "PREMIUM" });

  section("Billing: scheduled jobs");
  check("jobs endpoint needs the cron secret", (await anon.post("/api/cron/billing")).status === 403);
  const job = await fetch(`${BASE}/api/cron/billing`, { method: "POST", headers: { "x-cron-secret": envVal("CRON_SECRET") } });
  const jobData = await job.json();
  check("jobs run (reminders, renewals, expiry, retention)", job.status === 200 && "billing" in jobData && "retention" in jobData, jobData);

  section("Refunds: two-person rule and roles");
  const first = (await finance.get(`/api/admin/billing/payments?q=${co2.data?.paymentId}`)).data?.payments?.[0];
  check("moderators can't see payments", (await mod.get("/api/admin/billing/payments")).status === 403);
  const rfq = await support.post("/api/admin/billing/refunds", { paymentId: first?.id, amountMinor: 100, reason: "Charged by mistake (e2e)", revokeAccess: false });
  check("support can request a refund", rfq.status === 201, rfq.data);
  check("support can't approve one", (await support.post(`/api/admin/billing/refunds/${rfq.data?.refund?.id}`, { approve: true })).status === 403);
  check("too-large refund is refused", (await finance.post("/api/admin/billing/refunds", { paymentId: first?.id, amountMinor: 999999, reason: "Too much (e2e)" })).status >= 409);
  const ap = await finance.post(`/api/admin/billing/refunds/${rfq.data?.refund?.id}`, { approve: true, note: "OK" });
  check("finance approves (different person) and it's processed", ap.status === 200 && ap.data.status === "PROCESSED", ap.data);
  const rq2 = await finance.post("/api/admin/billing/refunds", { paymentId: (await finance.get(`/api/admin/billing/payments?q=pay_renew_${run}`)).data?.payments?.[0]?.id, amountMinor: 5000, reason: "Partial goodwill refund (e2e)" });
  check("the requester can't approve their own refund", (await finance.post(`/api/admin/billing/refunds/${rq2.data?.refund?.id}`, { approve: true })).status === 403);
  check("a second finance person can", (await finance2.post(`/api/admin/billing/refunds/${rq2.data?.refund?.id}`, { approve: true, note: "ok" })).data?.status === "PROCESSED");
  const hist = (await M.get("/api/billing/subscription")).data?.payments ?? [];
  check("customer sees refunded and partially refunded payments", hist.some((p: any) => p.status === "REFUNDED") && hist.some((p: any) => p.status === "PARTIALLY_REFUNDED"), hist.map((p: any) => p.status));
  const dsp = await hook({ event: "payment.dispute.created", payload: { dispute: { entity: { payment_id: `pay_renew2_${run}`, amount: 10000 } } } }, `evt_dsp_${run}`);
  check("chargebacks are recorded", dsp.data?.results?.[0] === "disputed", dsp.data);
  const stats = await finance.get("/api/admin/billing/stats");
  check("payments dashboard: revenue by currency, trials, refunds, chargebacks", stats.status === 200 && stats.data.revenue.total.some((x: any) => x.currency === "INR") && stats.data.trialToPaid?.endedIntros >= 1 && stats.data.chargebacks >= 1 && stats.data.refunds.length >= 1, stats.data);

  section("Offers, coupons and prices (admin)");
  const gb = await finance.post("/api/admin/billing/offers", { name: "UK men", kind: "INTRO", headline: "Try for £1", planCode: "PREMIUM", country: "GB", genders: ["MAN"], priceMinor: 100, days: 7 });
  check("gender-specific offers are blocked outside enabled countries", gb.status === 422 && gb.data?.code === "gender_pricing_off", gb.data);
  const flash = await finance.post("/api/admin/billing/offers", { name: `Flash ${run}`, kind: "DISCOUNT", headline: "50% off — today only", badge: "Today only", planCode: "PREMIUM_PLUS", country: "IN", discountPct: 50, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 86400_000).toISOString(), priority: 30 });
  check("finance creates a time-boxed flash offer", flash.status === 201, flash.data);
  const cpn = await finance.post("/api/admin/billing/coupons", { code: `E2E${run.toUpperCase().slice(-6)}`, kind: "PERCENT", value: 10, usageLimit: 5 });
  check("finance creates a coupon", cpn.status === 201, cpn.data);
  check("duplicate coupon codes are refused", (await finance.post("/api/admin/billing/coupons", { code: `E2E${run.toUpperCase().slice(-6)}`, kind: "PERCENT", value: 10 })).status === 409);
  check("support can't edit offers", (await support.get("/api/admin/billing/offers")).status === 403);

  section("Referrals and fraud checks");
  const refB = await M.get("/api/referrals");
  check("member gets an invite code and link", /^[A-Z2-9]{7}$/.test(refB.data?.code ?? "") && refB.data.link.includes(refB.data.code), refB.data);
  const C = new Client("Friend-C1");
  const regC = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.1", "x-install-id": `inst-c-${run}` }, body: JSON.stringify({ email: `friendc-${run}@test.local`, password: "Testing123", dob: "1997-05-05", acceptLegal: true, confirmAdult: true, safetyAcknowledged: true, referralCode: refB.data.code, client: "app", platform: "android" }) }).then((r) => r.json());
  check("friend joins with the code", !!regC.id, regC);
  const vC = await admin.post(`/api/admin/users/${regC.id}`, { action: "VERIFY", reason: "e2e" });
  const refB2 = await M.get("/api/referrals");
  check("friend verified → inviter rewarded with Premium days", vC.status === 200 && refB2.data?.history?.[0]?.status === "REWARDED" && refB2.data.earnedDays === refB2.data.rewardDays, refB2.data);
  check("paying inviter has the days saved for later", (await M.get("/api/billing/subscription")).data?.subscription?.bankedDays >= 7);
  const tokC = regC.accessToken;
  const refC = await fetch(`${BASE}/api/referrals`, { headers: { authorization: `Bearer ${tokC}` } }).then((r) => r.json());
  const regD = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.2", "x-install-id": `inst-c-${run}` }, body: JSON.stringify({ email: `selfref-${run}@test.local`, password: "Testing123", dob: "1997-05-05", acceptLegal: true, confirmAdult: true, safetyAcknowledged: true, referralCode: refC.code, client: "app" }) }).then((r) => r.json());
  await admin.post(`/api/admin/users/${regD.id}`, { action: "VERIFY", reason: "e2e" });
  const refC2 = await fetch(`${BASE}/api/referrals`, { headers: { authorization: `Bearer ${tokC}` } }).then((r) => r.json());
  check("a 'friend' made on the same device earns nothing", refC2.history?.[0]?.status === "REJECTED", refC2.history);
  for (let i = 0; i < 4; i++)
    await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.8.${i}`, "x-install-id": `farm-${run}` }, body: JSON.stringify({ email: `farm${i}-${run}@test.local`, password: "Testing123", dob: "1997-05-05", acceptLegal: true, confirmAdult: true, safetyAcknowledged: true, client: "app" }) });
  const farm5 = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.9.8.9", "x-install-id": `farm-${run}` }, body: JSON.stringify({ email: `farm9-${run}@test.local`, password: "Testing123", dob: "1997-05-05", acceptLegal: true, confirmAdult: true, safetyAcknowledged: true, client: "app" }) }).then((r) => r.json());
  const risk = await security.get("/api/admin/billing/risk");
  const farmFlag = risk.data?.queue?.find((u: any) => u.id === farm5.id);
  check("five accounts from one install → farmFlag for review (not banned)", farmFlag?.risk === "MEDIUM" && farmFlag.status === "ACTIVE" && farmFlag.signals.some((s: any) => s.kind === "SHARED_DEVICE"), farmFlag);
  const resv = await security.post(`/api/admin/billing/risk/${farm5.id}`, { note: "Checked: shared family phone (e2e)" });
  check("a reviewer can clear the signals", resv.data?.level === "LOW", resv.data);
  check("finance can't see the risk queue", (await finance.get("/api/admin/billing/risk")).status === 403);

  section("Security: sign-in history, 2-step codes, devices, headers");
  const aEmail = `tara-${run}@test.local`;
  await A.post("/api/auth/login", { email: aEmail, password: "Testing123" }); // a normal web sign-in first
  await anon.post("/api/auth/login", { email: aEmail, password: "wrong-password-1" });
  const hist2 = await A.get("/api/security/logins");
  check("sign-in history shows the failed attempt with a masked network", hist2.data?.logins?.some((l: any) => !l.success && l.reason === "Wrong password" && /x\.x$/.test(l.network ?? "")), hist2.data?.logins?.slice(0, 3));
  const oldPhone = await fetch(`${BASE}/api/auth/token`, { method: "POST", headers: { "content-type": "application/json", "x-install-id": `old-${run}` }, body: JSON.stringify({ email: aEmail, password: "Testing123", platform: "ios", deviceName: "Old iPhone" }) }).then((r) => r.json());
  const t1 = await A.post("/api/security/totp", { action: "start" });
  check("2-step setup returns a secret and authenticator link", /^[A-Z2-7]{32}$/.test(t1.data?.secret ?? "") && t1.data.otpauthUrl.startsWith("otpauth://totp/"), t1.data);
  check("wrong confirmation code is refused", (await A.post("/api/security/totp", { action: "confirm", code: "000000" })).status === 422);
  const t2 = await A.post("/api/security/totp", { action: "confirm", code: totpAt(t1.data.secret, Date.now()) });
  check("2-step verification turns on", t2.data?.enabled === true, t2.data);
  const noCode = await anon.post("/api/auth/token", { email: aEmail, password: "Testing123", platform: "android" });
  check("sign-in now asks for the code", noCode.status === 401 && noCode.data?.code === "totp_required", noCode.data);
  const withCode = await fetch(`${BASE}/api/auth/token`, { method: "POST", headers: { "content-type": "application/json", "x-install-id": `pixel-${run}` }, body: JSON.stringify({ email: aEmail, password: "Testing123", platform: "android", deviceName: "Pixel 9", totp: totpAt(t1.data.secret, Date.now()) }) }).then((r) => r.json());
  check("sign-in with the code works", !!withCode.accessToken, withCode);
  const replayCode = await anon.post("/api/auth/token", { email: aEmail, password: "Testing123", platform: "android", totp: totpAt(t1.data.secret, Date.now()) });
  check("the same 2-step code can't be used twice", replayCode.status === 401 && replayCode.data?.code === "bad_totp", replayCode.data);
  const notes = (await A.get("/api/notifications")).data?.notifications ?? [];
  check("new-device sign-in sends a security alert", notes.some((n: any) => n.title === "New sign-in to your account"), notes.slice(0, 3).map((n: any) => n.title));
  const authA = { authorization: `Bearer ${withCode.accessToken}`, "content-type": "application/json" };
  const devs = await fetch(`${BASE}/api/security/sessions`, { headers: authA }).then((r) => r.json());
  check("active devices list marks this one as current", devs.devices?.some((d: any) => d.current && d.name === "Pixel 9"), devs);
  const others = await fetch(`${BASE}/api/security/sessions`, { method: "POST", headers: authA, body: JSON.stringify({ action: "others" }) });
  check("signing out other devices cuts them off immediately", others.status === 200 && (await fetch(`${BASE}/api/me`, { headers: { authorization: `Bearer ${oldPhone.accessToken}` } })).status === 401 && (await fetch(`${BASE}/api/me`, { headers: authA })).status === 200);
  await A.post("/api/security/totp", { action: "disable", password: "Testing123", code: totpAt(t1.data.secret, Date.now()) });
  check("2-step can be turned off with password + code", (await A.get("/api/security/totp")).data?.enabled === false);
  const all = await fetch(`${BASE}/api/security/sessions`, { method: "POST", headers: authA, body: JSON.stringify({ action: "all" }) }).then((r) => r.json());
  const after = await fetch(`${BASE}/api/me`, { headers: authA });
  check("log out of all devices revokes app tokens and web sessions", all.signedOut === true && after.status === 401 && (await A.get("/api/me")).status === 401);
  await A.post("/api/auth/login", { email: aEmail, password: "Testing123" });
  const csrf = await fetch(`${BASE}/api/preferences`, { method: "PUT", headers: { "content-type": "application/json", cookie: A.cookie, origin: "https://evil.example" }, body: JSON.stringify({ showOnline: false }) });
  check("cross-site cookie requests are blocked (CSRF)", csrf.status === 403);
  const home = await fetch(`${BASE}/`);
  check("security headers: CSP, frame denial, no sniffing", !!home.headers.get("content-security-policy")?.includes("frame-ancestors 'none'") && home.headers.get("x-frame-options") === "DENY" && home.headers.get("x-content-type-options") === "nosniff");

  section("Privacy: encryption at rest, distance, export, deletion");
  const { createClient } = await import("@libsql/client");
  const dbc = createClient({ url: envVal("DATABASE_URL") || "file:./data/dev.db" });
  const lastMsg = (await dbc.execute("select body from messages where kind = 'TEXT' order by created_at desc limit 1")).rows[0]?.body as string;
  check("messages are stored encrypted (AES-256-GCM), not as text", lastMsg?.startsWith("enc:") && !/chai|board/i.test(lastMsg), lastMsg?.slice(0, 30));
  const pr = await A.put("/api/preferences", { showDistance: false, likesFrom: "VERIFIED" });
  check("privacy controls save (hide distance, verified-only likes)", pr.status === 200, pr.data);
  const exp = await fetch(`${BASE}/api/privacy/export`, { headers: { cookie: A.cookie } });
  const expJson = await exp.json();
  check("download my data: JSON with my info, no password hash or coordinates", exp.status === 200 && expJson.account?.email === aEmail && !JSON.stringify(expJson).includes("passwordHash") && !("lat" in (expJson.profile ?? {})), Object.keys(expJson));
  const dm = await A.post("/api/privacy/messages", {});
  check("delete my messages", dm.status === 200 && dm.data.deleted >= 1, dm.data);
  const delB = await M.del("/api/me", { password: "Testing123" });
  check("account deletion keeps only what the law requires", delB.status === 200 && delB.data.kept?.some((k: string) => /Payment/.test(k)), delB.data);
  check("deleted account can't sign in", (await anon.post("/api/auth/login", { email: `vikram-${run}@test.local`, password: "Testing123" })).status === 401);
  const anonPay = await finance.get(`/api/admin/billing/payments?q=${co2.data?.paymentId}`);
  check("payment records stay for tax, without the person's email", anonPay.data?.payments?.[0]?.email?.startsWith("deleted+"), anonPay.data?.payments?.[0]?.email);

  section("Forgot password");
  const fpEmail = `reset-${run}@test.local`;
  const R1 = new Client("Resetter1");
  const regR = await R1.post("/api/auth/register", { email: fpEmail, password: "Testing123", dob: "1995-03-03", acceptLegal: true, confirmAdult: true, safetyAcknowledged: true });
  check("reset: account created and signed in", regR.status < 300 && (await R1.get("/api/me")).status === 200, regR.data);
  const fpAnon = new Client("ForgotAnon1");
  const fUnknown = await fpAnon.post("/api/auth/forgot", { email: `nobody-${run}@test.local` });
  const fKnown = await fpAnon.post("/api/auth/forgot", { email: fpEmail });
  check("unknown and known emails get the same answer", fUnknown.status === 200 && fKnown.status === 200 && fUnknown.data.message === fKnown.data.message && !fUnknown.data.devResetUrl, [fUnknown.data, fKnown.data]);
  const resetUrl: string = fKnown.data.devResetUrl ?? "";
  const token = new URL(resetUrl || "http://x/").searchParams.get("token") ?? "";
  check("test mode returns the reset link", resetUrl.includes("/reset-password?token=") && token.length > 30, fKnown.data);
  check("link is valid before use", (await fpAnon.get(`/api/auth/reset?token=${encodeURIComponent(token)}`)).data?.valid === true);
  check("a weak new password is refused", (await fpAnon.post("/api/auth/reset", { token, password: "short" })).status === 422);
  const done = await fpAnon.post("/api/auth/reset", { token, password: "BrandNew!2026" });
  check("new password set", done.status === 200 && done.data.reset === true, done.data);
  check("the link can't be used twice", (await fpAnon.post("/api/auth/reset", { token, password: "Another!2026" })).status >= 400);
  check("a made-up link is refused", (await fpAnon.post("/api/auth/reset", { token: "x".repeat(43), password: "Another!2026" })).status >= 400);
  check("old sessions are signed out", (await R1.get("/api/me")).status === 401);
  check("old password no longer works", (await fpAnon.post("/api/auth/login", { email: fpEmail, password: "Testing123" })).status === 401);
  check("new password works", (await new Client("Resetter2").post("/api/auth/login", { email: fpEmail, password: "BrandNew!2026" })).status === 200);
  const f2 = await fpAnon.post("/api/auth/forgot", { email: fpEmail });
  const tok2 = new URL(f2.data.devResetUrl).searchParams.get("token");
  await fpAnon.post("/api/auth/forgot", { email: fpEmail });
  check("asking again cancels the older link", (await fpAnon.get(`/api/auth/reset?token=${tok2}`)).data?.valid === false);

  section("In-app purchases (App Store / Google Play, test mode)");
  const mockTok = (o: object) => "mock:" + Buffer.from(JSON.stringify(o)).toString("base64url");
  const IAP = new Client("Iap-Buyer01");
  await onboard(IAP, `iapman-${run}@test.local`, "MAN", "WOMAN", "Dev", answersB);
  const catI = (await IAP.get("/api/billing/catalogue")).data;
  const yearOpt = catI?.plans?.find((p: any) => p.code === "PREMIUM")?.options?.find((o: any) => o.durationDays === 365);
  check("catalogue offers store products per billing period", catI?.store?.enabled === true && yearOpt?.store?.apple === "premium_men_12m" && yearOpt?.store?.google === "premium_men_12m", { store: catI?.store, yearOpt: yearOpt?.store });
  const appleTok = catI?.store?.appleAccountToken;
  const yearAhead = Date.now() + 365 * 86_400_000;
  const buy = await IAP.post("/api/billing/store/verify", { platform: "ios", productId: "premium_men_12m", token: mockTok({ ref: `orig-${run}`, productId: "premium_men_12m", accountToken: appleTok, transactionId: `t1-${run}`, expiresAt: yearAhead, amountMinor: 100000, currency: "INR" }) });
  check("iPhone purchase verified: Premium on for a year", buy.status === 200 && buy.data.subscription?.provider === "APPLE" && buy.data.subscription?.periodDays === 365 && buy.data.subscription?.renews === true, buy.data);
  check("Premium features unlock after the store purchase", (await IAP.get("/api/me")).data?.features?.seeWhoLiked === true);
  await IAP.post("/api/billing/store/verify", { platform: "ios", token: mockTok({ ref: `orig-${run}`, productId: "premium_men_12m", accountToken: appleTok, transactionId: `t1-${run}`, expiresAt: yearAhead }) });
  const payI = (await IAP.get("/api/billing/subscription")).data?.payments ?? [];
  check("sending the same purchase twice records one payment, with no invoice of ours", payI.length === 1 && payI[0].amountMinor === 100000 && !payI[0].invoiceNo, payI);
  check("store plans can't be cancelled from our side", (await IAP.post("/api/billing/subscription", { action: "cancel" })).data?.code === "store_managed");
  const thief = new Client("Iap-Other02");
  await onboard(thief, `zoya-${run}@test.local`, "WOMAN", "MAN", "Zoya", answersA);
  check("another account can't claim someone else's purchase", (await thief.post("/api/billing/store/verify", { platform: "ios", token: mockTok({ ref: `orig-${run}`, productId: "premium_men_12m", accountToken: appleTok, transactionId: `t1-${run}`, expiresAt: yearAhead }) })).data?.code === "store_other_account");
  check("a purchase made for a different account is refused", (await thief.post("/api/billing/store/verify", { platform: "ios", token: mockTok({ ref: `orig2-${run}`, productId: "premium_1m", accountToken: appleTok, transactionId: `t9-${run}`, expiresAt: yearAhead }) })).data?.code === "store_other_account");
  check("an unknown product is refused", (await thief.post("/api/billing/store/verify", { platform: "ios", token: mockTok({ ref: `orig3-${run}`, productId: "free_forever", transactionId: `t8-${run}`, expiresAt: yearAhead }) })).data?.code === "store_unknown_product");
  check("a product that doesn't match the plan picked is refused", (await IAP.post("/api/billing/store/verify", { platform: "ios", productId: "premium_men_1m", token: mockTok({ ref: `orig-${run}`, productId: "premium_men_12m", accountToken: appleTok, transactionId: `t1-${run}`, expiresAt: yearAhead }) })).data?.code === "store_mismatch");
  await IAP.post("/api/billing/store/verify", { platform: "ios", token: mockTok({ ref: `orig-${run}`, productId: "premium_men_12m", accountToken: appleTok, transactionId: `t2-${run}`, expiresAt: yearAhead * 1 + 365 * 86_400_000 }) });
  check("a renewal adds a second payment", ((await IAP.get("/api/billing/subscription")).data?.payments ?? []).length === 2);
  await IAP.post("/api/billing/store/verify", { platform: "ios", token: mockTok({ ref: `orig-${run}`, productId: "premium_men_12m", accountToken: appleTok, transactionId: `t2-${run}`, expiresAt: yearAhead, autoRenew: false }) });
  check("turning off auto-renew in the store keeps Premium until the end", (await IAP.get("/api/billing/subscription")).data?.subscription?.renews === false && (await IAP.get("/api/me")).data?.features?.seeWhoLiked === true);
  await IAP.post("/api/billing/store/restore", { platform: "ios", tokens: [mockTok({ ref: `orig-${run}`, productId: "premium_men_12m", accountToken: appleTok, transactionId: `t2-${run}`, expiresAt: yearAhead, status: "REVOKED" })] });
  const afterRefund = (await IAP.get("/api/billing/subscription")).data;
  check("a store refund ends Premium and marks the payment refunded", afterRefund?.subscription?.status !== "ACTIVE" && afterRefund?.payments?.some((p: any) => p.status === "REFUNDED") && (await IAP.get("/api/me")).data?.features?.seeWhoLiked === false, afterRefund);
  const gTok = (await thief.get("/api/billing/catalogue")).data?.store?.googleAccountId;
  const gBuy = await thief.post("/api/billing/store/verify", { platform: "android", token: mockTok({ ref: `gtok-${run}`, productId: "premium_12m", accountToken: gTok, transactionId: `GPA.${run}-0`, expiresAt: yearAhead }) });
  check("Android purchase verified (women's yearly plan)", gBuy.status === 200 && gBuy.data.subscription?.provider === "GOOGLE" && gBuy.data.subscription?.regularMinor === 50000, gBuy.data);
  check("Play notifications without the secret are refused", (await anon.post("/api/billing/google/notifications", { message: { data: "e30=" } })).status === 403);
  check("unsigned App Store notifications are refused", (await anon.post("/api/billing/apple/notifications", { signedPayload: "not.a.jws" })).status === 400);

  section("Grievance Officer and published contacts");
  const gAnon = new Client("Complainant1");
  const g1 = await gAnon.post("/api/grievances", { name: "Riya", email: `riya-${run}@test.local`, category: "CONTENT", details: "Someone keeps sending me rude messages after I unmatched." });
  check("anyone can file a complaint and gets a reference number", g1.status === 201 && /^GR-\d{6}-\d{6}$/.test(g1.data.refNo), g1.data);
  check("normal complaints are due within 15 days", Math.round((Date.parse(g1.data.resolveDueAt) - Date.now()) / 86_400_000) === 15, g1.data);
  const g2 = await gAnon.post("/api/grievances", { name: "Riya", email: `riya-${run}@test.local`, category: "INTIMATE_OR_IMPERSONATION", details: "A profile is using my photos and pretending to be me." });
  check("intimate-image and impersonation complaints are due within 24 hours", Math.round((Date.parse(g2.data.resolveDueAt) - Date.now()) / 3_600_000) === 24, g2.data);
  check("a complaint without details is refused", (await gAnon.post("/api/grievances", { name: "Riya", email: `riya-${run}@test.local`, category: "OTHER", details: "help" })).status === 422);
  check("finance staff can't see complaints", (await finance.get("/api/admin/grievances")).status === 403);
  const gl = await admin.get("/api/admin/grievances");
  const mine = gl.data?.grievances?.find((x: any) => x.refNo === g1.data.refNo);
  check("staff see the complaint, soonest deadline first", !!mine && mine.email === `riya-${run}@test.local` && gl.data.grievances[0].category === "INTIMATE_OR_IMPERSONATION", gl.data?.grievances?.slice(0, 2));
  check("resolving needs a written reply", (await admin.post(`/api/admin/grievances/${mine?.id}`, { action: "resolve" })).status === 422);
  check("staff resolve with a reply", (await admin.post(`/api/admin/grievances/${mine?.id}`, { action: "resolve", reply: "We reviewed the messages and suspended the account. Thank you for telling us." })).data?.status === "RESOLVED");
  check("a closed complaint can't be changed", (await admin.post(`/api/admin/grievances/${mine?.id}`, { action: "reject", reply: "Trying to reopen this one." })).status === 409);
  await admin.put("/api/admin/config", { config: { "legal.contacts": { companyName: "Test Co Pvt Ltd", supportEmail: "support@test.local", safetyEmail: "safety@test.local", privacyEmail: "privacy@test.local", grievanceOfficer: { name: `Officer ${run}`, designation: "Grievance Officer", email: "grievance@test.local", phone: "", address: "Delhi" } } } });
  check("published contacts are public", (await anon.get("/api/public/contacts")).data?.contacts?.grievanceOfficer?.name === `Officer ${run}`);
  const contactHtml = await fetch(`${BASE}/contact`).then((r) => r.text());
  check("the Contact page shows the Grievance Officer", contactHtml.includes(`Officer ${run}`) && contactHtml.includes("grievance@test.local"));

  section("Database backups");
  const bk = await admin.post("/api/admin/backups", {});
  check("an encrypted backup can be taken on demand", bk.status === 200 && bk.data.ran === true && bk.data.bytes > 1000, bk.data);
  const bks = await admin.get("/api/admin/backups");
  check("backup status lists it", bks.data?.configured === true && bks.data.recent?.[0]?.key === bk.data.key && !bks.data.last.error, bks.data);
  check("finance staff can't take backups", (await finance.post("/api/admin/backups", {})).status === 403);

  section("Photo checks (staff review queue)");
  await admin.put("/api/admin/config", { config: { "moderation.photoScreening": "review" } });
  const tokNow = (await anon.post("/api/auth/token", { email: appEmail, password: "Testing123", platform: "android" })).data?.accessToken; // the early token has expired by now
  const fReview = new FormData(); fReview.append("file", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "review.jpg");
  const upR = await bearer("POST", "/api/photos", undefined, tokNow, fReview);
  check("in review mode a new photo waits for a check", upR.status === 201 && upR.data.photo?.status === "PENDING" && /checking this photo/.test(upR.data.photo.hint), upR.data);
  const queue = await admin.get("/api/admin/photos");
  check("staff see it in Photo review", queue.data?.photos?.some((p: any) => p.id === upR.data.photo.id), queue.data);
  check("finance staff can't review photos", (await finance.get("/api/admin/photos")).status === 403);
  check("staff approve it", (await admin.post(`/api/admin/photos/${upR.data.photo.id}`, { approve: true })).data?.status === "LIVE");
  check("an approved photo can't be reviewed twice", (await admin.post(`/api/admin/photos/${upR.data.photo.id}`, { approve: false })).status === 409);
  const fReview2 = new FormData(); fReview2.append("file", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "review2.jpg");
  const upR2 = await bearer("POST", "/api/photos", undefined, tokNow, fReview2);
  await admin.post(`/api/admin/photos/${upR2.data.photo.id}`, { approve: false });
  const mineAfter = (await bearer("GET", "/api/photos", undefined, tokNow)).data?.photos ?? [];
  check("a refused photo is removed and the rest renumbered", !mineAfter.some((p: any) => p.id === upR2.data.photo.id) && mineAfter.every((p: any, i: number) => p.position === i), mineAfter.map((p: any) => [p.id.slice(0, 4), p.position, p.status]));
  await admin.put("/api/admin/config", { config: { "moderation.photoScreening": "auto" } });

  section("Selfie verification (pose + face check + staff decision)");
  {
    // Test faces are crops of the face-api package's bundled demo photo (not real members).
    const sample = (await import("node:fs")).readFileSync("node_modules/@vladmandic/face-api/demo/sample1.jpg");
    const profileFace = await sharp(sample).extract({ left: 290, top: 220, width: 420, height: 520 }).jpeg().toBuffer();
    const selfie = await sharp(sample).extract({ left: 260, top: 190, width: 480, height: 580 }).modulate({ brightness: 1.1 }).flop().jpeg().toBuffer();
    const V = new Client("Verifier9"), O = new Client("OtherOne7");
    const vId = await onboard(V, `verif-${run}@test.local`, "WOMAN", "MAN", "Ira", answersA);
    await onboard(O, `verif2-${run}@test.local`, "MAN", "WOMAN", "Dev", answersB);
    const ph = await V.upload("/api/photos", { file: profileFace });
    check("profile photo with a face goes live", ph.status === 201 && ph.data.photo?.status === "LIVE", ph.data);
    const st = await V.post("/api/verification");
    check("a fresh pose each time", st.status === 200 && st.data.status === "CHALLENGE", st.data);
    const att = st.data.attemptId;
    const blank = await V.upload("/api/verification/selfie", { attemptId: att, file: Buffer.from(jpeg) });
    check("a selfie with no face asks for a retake", blank.status === 200 && blank.data.state === "RETAKE" && /couldn't see your face/.test(blank.data.message), blank.data);
    const group = await V.upload("/api/verification/selfie", { attemptId: att, file: sample });
    check("a selfie with several people asks for a retake", group.data?.state === "RETAKE" && /Only you/.test(group.data.message), group.data);
    check("someone else can't use your pose", (await O.upload("/api/verification/selfie", { attemptId: att, file: selfie })).status === 404);
    const ok = await V.upload("/api/verification/selfie", { attemptId: att, file: selfie });
    check("a clear selfie goes to staff", ok.status === 200 && ok.data.state === "PENDING", ok.data);
    check("the same pose can't be sent twice", (await V.upload("/api/verification/selfie", { attemptId: att, file: selfie })).status === 409);
    check("member sees it's under review", (await V.get("/api/verification")).data?.status === "PENDING");
    check("can't start again while under review", (await V.post("/api/verification")).status === 409);
    const q = await admin.get("/api/admin/verification");
    const item = q.data?.queue?.find((x: any) => x.userId === vId);
    check("staff see the selfie, pose, profile photos and a strong match", item && item.match === "STRONG" && item.distance < 0.45 && item.photos.length >= 1 && !!item.selfieUrl && !!item.pose?.text, item);
    check("finance staff can't see selfies", (await finance.get("/api/admin/verification")).status === 403);
    check("members can't see the queue", (await V.get("/api/admin/verification")).status === 403);
    const selfieUrl = new URL(item?.selfieUrl ?? "/", BASE).toString();
    check("the selfie is readable before the decision", (await fetch(selfieUrl, { headers: { cookie: admin.cookie } })).status === 200);
    check("staff approve it", (await admin.post(`/api/admin/users/${vId}`, { action: "VERIFY", reason: "Same person, pose correct (e2e)" })).status === 200);
    check("approved member is verified", (await V.get("/api/me")).data?.user?.selfieStatus === "VERIFIED");
    check("the selfie is deleted after the decision", (await fetch(selfieUrl, { headers: { cookie: admin.cookie } })).status !== 200);
    check("it leaves the queue", !(await admin.get("/api/admin/verification")).data?.queue?.some((x: any) => x.userId === vId));
  }

  section("Offers: no false urgency");
  const fake = await admin.post("/api/admin/billing/offers", { name: `Fake urgency ${run}`, kind: "DISCOUNT", headline: "Hurry — 20% off", badge: "Today only", planCode: "VIP", country: "IN", discountPct: 20, active: false });
  check("\"Today only\" without a real end date is refused", fake.status === 422 && fake.data?.code === "false_urgency", fake.data);
  const real = await admin.post("/api/admin/billing/offers", { name: `Real urgency ${run}`, kind: "DISCOUNT", headline: "20% off", badge: "Today only", planCode: "VIP", country: "IN", discountPct: 20, endsAt: new Date(Date.now() + 12 * 3_600_000).toISOString(), active: false });
  check("\"Today only\" with an end date today is allowed", real.status === 201, real.data);

  section("Chat: instant delivery and typing");
  const w2Id = (await W2.get("/api/me")).data?.user?.id, m3Id = (await M3.get("/api/me")).data?.user?.id;
  await W2.post("/api/likes", { toId: m3Id, kind: "LIKE" });
  const mt = await M3.post("/api/likes", { toId: w2Id, kind: "LIKE" });
  const rtMatch = mt.data?.matchId;
  check("a match to chat in", !!rtMatch, mt.data);
  const v0 = (await W2.get(`/api/matches/${rtMatch}/wait?v=-1&wait=0`)).data?.version;
  const rt0 = Date.now();
  const waiting = W2.get(`/api/matches/${rtMatch}/wait?v=${v0}&typing=0`);
  await new Promise((r) => setTimeout(r, 300));
  await M3.post(`/api/matches/${rtMatch}/typing`, { typing: true });
  const typed = await waiting;
  check("the other person sees \"typing…\" at once", typed.data?.typing === true && Date.now() - rt0 < 3000, typed.data);
  const rt1 = Date.now();
  const waiting2 = W2.get(`/api/matches/${rtMatch}/wait?v=${typed.data.version}&typing=1`);
  await new Promise((r) => setTimeout(r, 300));
  await M3.post(`/api/matches/${rtMatch}/messages`, { body: "Hey Meera! Coffee this week?" });
  const got = await waiting2;
  check("a new message wakes the other phone at once (no polling delay)", got.data?.version > typed.data.version && got.data.typing === false && Date.now() - rt1 < 3000, got.data);
  check("outsiders can't listen to a chat", (await IAP.get(`/api/matches/${rtMatch}/wait?v=0&wait=0`)).status === 404);

  section("Voice and video calls");
  {
    const locked = await W2.get(`/api/matches/${rtMatch}/call`);
    check("calls stay locked until both people have messaged", locked.data?.canCall === false && locked.data.code === "calls_locked", locked.data);
    check("ringing a locked chat is refused", (await W2.post(`/api/matches/${rtMatch}/call`, { kind: "VIDEO" })).data?.code === "calls_locked");
    await W2.post(`/api/matches/${rtMatch}/messages`, { body: "Yes! Thursday?" });
    const st0 = (await W2.get(`/api/matches/${rtMatch}/call`)).data;
    check("after both have messaged, a call still needs a request first", st0?.canCall === false && st0.code === "needs_request" && st0.canRequest === true, st0);
    check("calling without a request is refused", (await W2.post(`/api/matches/${rtMatch}/call`, { kind: "VIDEO" })).data?.code === "needs_request");

    section("Call requests (nobody is called without accepting)");
    const rq = await W2.post("/api/call-requests", { matchId: rtMatch, kind: "VIDEO" });
    check("W2 sends a call request", rq.status === 201 && rq.data?.request?.state === "PENDING", rq.data);
    check("…only once at a time", (await W2.post("/api/call-requests", { matchId: rtMatch, kind: "VIDEO" })).data?.code === "pending");
    const m3st = (await M3.get(`/api/matches/${rtMatch}/call`)).data;
    check("M3 sees it waiting for an answer", m3st?.request?.state === "PENDING" && m3st.request.mine === false && m3st.canCall === false, m3st);
    const note = ((await M3.get("/api/notifications")).data?.notifications ?? []).find((n: any) => /wants to have a call with you\. ❤️$/.test(n.title));
    check("M3 is notified \"… wants to have a call with you. ❤️\"", !!note && /accept or decline/.test(note.body), note);
    check("the person asking can't accept their own request", (await W2.post(`/api/call-requests/${rq.data?.request?.id}`, { action: "accept" })).status === 403);
    check("outsiders can't answer it", (await IAP.post(`/api/call-requests/${rq.data?.request?.id}`, { action: "accept" })).status === 404);
    check("still no call before accepting", (await W2.post(`/api/matches/${rtMatch}/call`, { kind: "AUDIO" })).data?.code === "needs_request");
    check("M3 declines", (await M3.post(`/api/call-requests/${rq.data?.request?.id}`, { action: "decline" })).data?.state === "DECLINED");
    check("after a decline, W2 can't ask again straight away", (await W2.post("/api/call-requests", { matchId: rtMatch, kind: "VIDEO" })).data?.code === "declined_recently");
    await W2.put("/api/preferences", { callRequests: "NOBODY" });
    check("someone who takes no call requests can't be asked", (await M3.post("/api/call-requests", { matchId: rtMatch, kind: "AUDIO" })).data?.code === "not_accepting");
    await W2.put("/api/preferences", { callRequests: "MATCHES" });
    const rq2 = await M3.post("/api/call-requests", { userId: w2Id, kind: "VIDEO" });
    check("a request can be sent from the profile (by person, not chat)", rq2.status === 201, rq2.data);
    check("W2 accepts", (await W2.post(`/api/call-requests/${rq2.data?.request?.id}`, { action: "accept" })).data?.state === "ACCEPTED");
    const acceptedNote = ((await M3.get("/api/notifications")).data?.notifications ?? []).find((n: any) => n.title === "Your call request was accepted ❤️📞");
    check("M3 is told \"It's a yes! Time to talk. 💕📞\"", acceptedNote?.body === "It's a yes! Time to talk. 💕📞", acceptedNote);
    check("now either of them can call", (await W2.get(`/api/matches/${rtMatch}/call`)).data?.canCall === true && (await M3.get(`/api/matches/${rtMatch}/call`)).data?.canCall === true);
    const hist = (await M3.get("/api/calls/history")).data?.items ?? [];
    check("call history lists requests with who and the outcome", hist.some((h: any) => h.type === "REQUEST" && h.outcome === "Accepted" && h.with?.name) && hist.some((h: any) => h.outcome === "Declined"), hist.slice(0, 3));
    check("call history shows no private details", hist.every((h: any) => !("email" in h.with) && !("phone" in h.with)));
    const adminCalls = await admin.get("/api/admin/calls");
    check("staff can see call requests", adminCalls.data?.requests?.some((r: any) => r.id === rq2.data?.request?.id && r.state === "ACCEPTED"), adminCalls.data?.requests?.slice(0, 2));
    const stats = (await admin.get("/api/admin/stats")).data;
    check("the dashboard counts call requests and memberships", stats?.calls?.requests >= 2 && stats.calls.accepted >= 1 && stats.calls.declined >= 1 && typeof stats.members?.men === "number", { calls: stats?.calls, members: stats?.members });
    check("outsiders can't call into the chat", (await IAP.post(`/api/matches/${rtMatch}/call`, { kind: "AUDIO" })).status === 404);

    const incoming = M3.get("/api/calls/incoming?wait=10000");
    await new Promise((r) => setTimeout(r, 300));
    const t0 = Date.now();
    const start = await W2.post(`/api/matches/${rtMatch}/call`, { kind: "VIDEO" });
    check("W2 rings M3", start.status === 201 && start.data.call?.state === "RINGING" && start.data.call.incoming === false, start.data);
    check("the app gets connection settings (never the relay secret)", !!start.data.ice && !JSON.stringify(start.data).includes(process.env.TURN_SECRET || "no-secret-set"), start.data.ice);
    const callId = start.data.call?.id;
    const ring = await incoming;
    check("the other phone hears about it at once", ring.data?.call?.id === callId && ring.data.call.from?.name && Date.now() - t0 < 3000, ring.data);
    check("the ring shows a first name and photo, nothing private", ring.data?.call && !("email" in ring.data.call.from) && !("phone" in ring.data.call.from), ring.data?.call?.from);
    check("a second call while ringing is refused", (await M3.post(`/api/matches/${rtMatch}/call`, { kind: "AUDIO" })).data?.code === "busy");
    check("the callee can't send an offer before answering", (await M3.post(`/api/calls/${callId}/signal`, { type: "offer", data: { type: "offer", sdp: "x" } })).status === 409);
    check("the caller sends the offer", (await W2.post(`/api/calls/${callId}/signal`, { type: "offer", data: { type: "offer", sdp: "v=0 test" } })).status === 200);
    await W2.post(`/api/calls/${callId}/signal`, { type: "ice", data: { candidate: "candidate:1 1 udp 1 10.0.0.1 9 typ host", sdpMid: "0" } });
    check("outsiders can't read the call", (await IAP.get(`/api/calls/${callId}?wait=0`)).status === 404);
    check("outsiders can't inject signals", (await IAP.post(`/api/calls/${callId}/signal`, { type: "ice", data: {} })).status === 404);
    check("only the callee can answer", (await W2.post(`/api/calls/${callId}`, { action: "accept" })).status === 403);
    const acc = await M3.post(`/api/calls/${callId}`, { action: "accept" });
    check("M3 answers", acc.data?.call?.state === "ACTIVE" && !!acc.data.ice, acc.data);
    const sig = await M3.get(`/api/calls/${callId}?after=0&wait=0`);
    check("the callee receives the offer and candidate in order", sig.data?.signals?.map((x: any) => x.type).join(",") === "offer,ice", sig.data);
    const waitAns = W2.get(`/api/calls/${callId}?after=0&wait=10000`);
    await new Promise((r) => setTimeout(r, 300));
    const t1 = Date.now();
    await M3.post(`/api/calls/${callId}/signal`, { type: "answer", data: { type: "answer", sdp: "v=0 answer" } });
    const ans = await waitAns;
    check("the answer reaches the caller at once and the caller never sees their own signals", ans.data?.signals?.length === 1 && ans.data.signals[0].type === "answer" && Date.now() - t1 < 3000, ans.data);
    check("signals that are too large are refused", (await W2.post(`/api/calls/${callId}/signal`, { type: "ice", data: "x".repeat(30_000) })).status === 413);
    const hang = await W2.post(`/api/calls/${callId}`, { action: "end" });
    check("hanging up ends it for both", hang.data?.call?.state === "ENDED" && hang.data.call.endReason === "HUNG_UP" && (await M3.get(`/api/calls/${callId}?wait=0`)).data?.call?.state === "ENDED", hang.data);
    check("no signals after the call ends", (await M3.post(`/api/calls/${callId}/signal`, { type: "ice", data: {} })).status === 410);
    const log = (await M3.get(`/api/matches/${rtMatch}/messages`)).data?.messages ?? [];
    check("the chat shows the call happened", log.some((m: any) => m.kind === "SYSTEM" && /Video call · \d+:\d\d/.test(m.body)), log.slice(-3));

    const c2 = await M3.post(`/api/matches/${rtMatch}/call`, { kind: "AUDIO" });
    check("declining a call", (await W2.post(`/api/calls/${c2.data.call.id}`, { action: "decline" })).data?.call?.endReason === "DECLINED");
    const c3 = await M3.post(`/api/matches/${rtMatch}/call`, { kind: "AUDIO" });
    await M3.post(`/api/calls/${c3.data.call.id}`, { action: "end" });
    const missed = (await W2.get("/api/notifications")).data?.notifications ?? [];
    check("a cancelled ring leaves a missed-call notice", missed.some((n: any) => /Missed voice call/.test(n.title)), missed.slice(0, 2));

    section("Notifications on the web app (Web Push)");
    if (process.env.PUSH_TEST_CERT && process.env.PUSH_TEST_PORT) {
      // A stand-in for Apple's/Google's push service on this machine: records what the server sends and
      // decrypts it with the "browser" keys, exactly as a phone would.
      const https = await import("node:https"), nodeCrypto = await import("node:crypto"), fs = await import("node:fs");
      // @ts-expect-error http_ece (used by web-push) ships no types
      const ece = (await import("http_ece")).default as any;
      const got: { path: string; headers: any; body: Buffer }[] = [];
      let reply = 201;
      const srv = https.createServer({ cert: fs.readFileSync(process.env.PUSH_TEST_CERT), key: fs.readFileSync(process.env.PUSH_TEST_KEY!) }, (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => { got.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) }); res.statusCode = reply; res.end(); });
      });
      await new Promise<void>((r) => srv.listen(Number(process.env.PUSH_TEST_PORT), "127.0.0.1", () => r()));
      const ecdh = nodeCrypto.createECDH("prime256v1"); ecdh.generateKeys();
      const auth = nodeCrypto.randomBytes(16).toString("base64url");
      const endpoint = `https://127.0.0.1:${process.env.PUSH_TEST_PORT}/push/m3-${run}`;
      const sub = { endpoint, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth } };
      const read = (i: number) => JSON.parse(ece.decrypt(got[i].body, { version: "aes128gcm", privateKey: ecdh, authSecret: auth }).toString());
      const waitFor = async (n: number) => { for (let i = 0; i < 40 && got.length < n; i++) await new Promise((r) => setTimeout(r, 100)); return got.length >= n; };

      const key = await M3.get("/api/push/web");
      check("the app gets the public key for notifications", key.data?.enabled === true && /^[A-Za-z0-9_-]{80,}$/.test(key.data.publicKey ?? ""), key.data);
      check("the key stays the same", (await W2.get("/api/push/web")).data?.publicKey === key.data?.publicKey);
      check("only real push services are accepted (no requests to other servers)", (await M3.post("/api/push/web", { ...sub, endpoint: "https://internal.example.com/x" })).data?.code === "push_endpoint");
      check("plain http push addresses are refused", (await M3.post("/api/push/web", { ...sub, endpoint: `http://127.0.0.1:${process.env.PUSH_TEST_PORT}/x` })).status === 422);
      check("turning notifications on", (await M3.post("/api/push/web", sub)).status === 201);

      await W2.post(`/api/matches/${rtMatch}/messages`, { body: "Secret plans for Saturday" });
      const reply1 = M3.post(`/api/matches/${rtMatch}/messages`, { body: "Tell me!" });
      check("a new message sends a notification at once", await waitFor(1), got.length);
      const p1 = got[0] ? read(0) : null;
      check("it's encrypted for this phone and signed by our server", got[0]?.headers["content-encoding"] === "aes128gcm" && /^vapid t=.+, k=.+/.test(got[0]?.headers.authorization ?? "") && !got[0].body.includes(Buffer.from("New message")), got[0]?.headers);
      check("it opens the right chat and never contains the message text", p1?.title === "New message" && p1.link === `/matches/${rtMatch}` && !JSON.stringify(p1).includes("Saturday"), p1);

      const ring = await W2.post(`/api/matches/${rtMatch}/call`, { kind: "AUDIO" });
      await waitFor(2);
      const p2 = got[1] ? read(1) : null;
      check("an incoming call notifies at once, marked urgent", /is calling$/.test(p2?.title ?? "") && got[1]?.headers.urgency === "high", { p2, h: got[1]?.headers });
      if (ring.data?.call?.id) await W2.post(`/api/calls/${ring.data.call.id}`, { action: "end" });
      await waitFor(3); // the missed-call notice

      await reply1;
      reply = 410; // the phone removed the app: the push service says the address is gone
      const before = got.length;
      await W2.post(`/api/matches/${rtMatch}/messages`, { body: "Are you there?" });
      await waitFor(before + 1);
      reply = 201;
      await M3.post(`/api/matches/${rtMatch}/messages`, { body: "Yes, here" });
      await new Promise((r) => setTimeout(r, 300));
      await W2.post(`/api/matches/${rtMatch}/messages`, { body: "Hello?" });
      await new Promise((r) => setTimeout(r, 1500));
      check("addresses the push service says are gone are forgotten", got.length === before + 1, got.length - before);

      await M3.post(`/api/matches/${rtMatch}/messages`, { body: "Ok" });
      await M3.post("/api/push/web", sub);
      await W2.del("/api/push/web", { endpoint }); // someone else can't turn yours off
      const n1 = got.length;
      await W2.post(`/api/matches/${rtMatch}/messages`, { body: "Still on?" });
      check("someone else can't turn off your notifications", await waitFor(n1 + 1));
      await M3.post(`/api/matches/${rtMatch}/messages`, { body: "Yes" });
      check("turning notifications off", (await M3.del("/api/push/web", { endpoint })).status === 200);
      const n0 = got.length;
      await W2.post(`/api/matches/${rtMatch}/messages`, { body: "Last one" });
      await new Promise((r) => setTimeout(r, 1500));
      check("…and nothing is sent afterwards", got.length === n0);
      srv.close();
    } else console.log("  (skipped: set PUSH_TEST_CERT, PUSH_TEST_KEY and PUSH_TEST_PORT to run the fake push service)");

    const c4 = await W2.post(`/api/matches/${rtMatch}/call`, { kind: "VIDEO" });
    await M3.post(`/api/calls/${c4.data.call.id}`, { action: "accept" });
    await M3.post("/api/blocks", { userId: w2Id });
    check("blocking ends a call in progress", (await W2.get(`/api/calls/${c4.data.call.id}?wait=0`)).data?.call?.endReason === "BLOCKED");
    check("blocked people can't call", (await W2.post(`/api/matches/${rtMatch}/call`, { kind: "AUDIO" })).status >= 400);
  }

  section("Chat: photos, voice messages, hearts, kindness check");
  {
    const P1 = new Client("PhotoOne1"), P2 = new Client("PhotoTwo22");
    const p1 = await onboard(P1, `media1-${run}@test.local`, "WOMAN", "MAN", "Asha", answersA);
    const p2 = await onboard(P2, `media2-${run}@test.local`, "MAN", "WOMAN", "Nikhil", answersB);
    await P1.post("/api/likes", { toId: p2, kind: "LIKE" });
    const mm = (await P2.post("/api/likes", { toId: p1, kind: "LIKE" })).data?.matchId;
    check("a fresh match for media tests", !!mm);
    const sharpLib = (await import("sharp")).default;
    const pic = await sharpLib({ create: { width: 1200, height: 900, channels: 3, background: { r: 120, g: 160, b: 200 } } })
      .withExifMerge({ IFD0: { Make: "TestPhone", Software: "e2e" } }).jpeg().toBuffer();
    check("the test photo really carries EXIF data", !!(await sharpLib(pic).metadata()).exif);
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(4000, 7)]);

    check("no photos before both people have written", (await P1.upload(`/api/matches/${mm}/media`, { kind: "photo", file: pic })).data?.code === "media_locked");
    check("…and the app is told they're locked", (await P1.get(`/api/matches/${mm}/messages`)).data?.mediaUnlocked === false);
    await P1.post(`/api/matches/${mm}/messages`, { body: "Hi Nikhil!" });
    await P2.post(`/api/matches/${mm}/messages`, { body: "Hey Asha 👋" });
    check("unlocked once both have written", (await P1.get(`/api/matches/${mm}/messages`)).data?.mediaUnlocked === true);

    const sentPhoto = await P1.upload(`/api/matches/${mm}/media`, { kind: "photo", file: pic });
    check("a photo is sent", sentPhoto.status === 201, sentPhoto.data);
    const seen = (await P2.get(`/api/matches/${mm}/messages`)).data?.messages ?? [];
    const pm = seen.find((m: any) => m.id === sentPhoto.data?.id);
    check("the other person gets it with a blur preview and a private link", pm?.kind === "PHOTO" && pm.body === "📷 Photo" && !!pm.media?.blurhash && /\/api\/media\/chat\//.test(pm.media?.url ?? ""), pm);
    const photoUrl = new URL(pm?.media?.url ?? "/", BASE).toString();
    const delivered = Buffer.from(await (await fetch(photoUrl)).arrayBuffer());
    const meta = await sharpLib(delivered).metadata();
    check("the delivered photo has no EXIF data (so no GPS location)", meta.format === "webp" && !meta.exif, { format: meta.format, exif: !!meta.exif });
    const O = new Client("Outsider77");
    await onboard(O, `media3-${run}@test.local`, "MAN", "WOMAN", "Rahul", answersB);
    check("outsiders can't send media into the chat", (await O.upload(`/api/matches/${mm}/media`, { kind: "photo", file: pic })).status === 404);

    const voice = await P2.upload(`/api/matches/${mm}/media`, { kind: "voice", ms: "4200", file: webm });
    check("a voice message is sent", voice.status === 201, voice.data);
    check("random bytes aren't accepted as audio", (await P2.upload(`/api/matches/${mm}/media`, { kind: "voice", ms: "1000", file: Buffer.alloc(3000, 1) })).data?.code === "bad_audio");
    const vm = ((await P1.get(`/api/matches/${mm}/messages`)).data?.messages ?? []).find((m: any) => m.id === voice.data?.id);
    check("it shows its length", vm?.kind === "VOICE" && vm.media?.ms === 4200, vm);
    const ranged = await fetch(new URL(vm?.media?.url ?? "/", BASE), { headers: { range: "bytes=0-99" } });
    check("audio can be streamed in parts (needed by iPhone Safari)", ranged.status === 206 && ranged.headers.get("content-range") === `bytes 0-99/${webm.length}` && ranged.headers.get("content-type") === "audio/webm", { s: ranged.status, r: ranged.headers.get("content-range") });

    const textId = seen.find((m: any) => m.kind === "TEXT" && !m.mine)?.id;
    check("a heart on a message", (await P2.post(`/api/messages/${textId}/react`, { on: true })).status === 200);
    check("the sender sees it", ((await P1.get(`/api/matches/${mm}/messages`)).data?.messages ?? []).find((m: any) => m.id === textId)?.hearts?.theirs === true);
    check("outsiders can't heart messages", (await O.post(`/api/messages/${textId}/react`, { on: true })).status === 404);
    await P2.post(`/api/messages/${textId}/react`, { on: false });
    check("hearts can be removed", ((await P1.get(`/api/matches/${mm}/messages`)).data?.messages ?? []).find((m: any) => m.id === textId)?.hearts?.theirs === false);

    const harsh = await P2.post(`/api/matches/${mm}/messages`, { body: "you are so stupid" });
    check("a hurtful message gets a kindness check first", harsh.status === 409 && harsh.data?.code === "kindness_check", harsh.data);
    const anyway = await P2.post(`/api/matches/${mm}/messages`, { body: "you are so stupid", confirmed: true });
    check("…but can still be sent (and is still screened)", anyway.status === 201 && anyway.data?.flagged === true, anyway.data);

    await P1.del(`/api/messages/${sentPhoto.data?.id}`);
    check("deleting a photo message deletes the photo", (await fetch(photoUrl)).status === 404);

    const voiceUrl = new URL(vm?.media?.url ?? "/", BASE).toString();
    const rep = await P1.post("/api/reports", { reportedId: p2, matchId: mm, category: "HARASSMENT", details: "Rude message in chat (e2e)", alsoBlock: true });
    check("reporting and blocking ends the chat", rep.status === 201, rep.data);
    check("a reported chat keeps its voice messages as evidence", (await fetch(voiceUrl)).status === 200);
    const rid = rep.data?.report?.id ?? rep.data?.id;
    const ev = rid ? await admin.get(`/api/admin/reports/${rid}`) : null;
    check("moderators can hear it in the report", ev?.data?.evidence?.some((m: any) => m.kind === "VOICE" && !!m.media?.url), ev?.data?.evidence?.map((m: any) => m.kind));
  }

  section("Membership v3: free forever for women, 15-day trial for men (India)");
  {
    await admin.put("/api/admin/config", { config: { "rewards.womenFreeForever": true, "rewards.menTrialDays": 15 } });
    if (legacyIntroId) await admin.put(`/api/admin/billing/offers/${legacyIntroId}`, { ...legacyIntro, active: false });
    const W = new Client("MemberWoman1"), Mn = new Client("MemberMan22");
    await onboard(W, `free-${run}@test.local`, "WOMAN", "MAN", "Kiran", answersA);
    await onboard(Mn, `trial-${run}@test.local`, "MAN", "WOMAN", "Arjun", answersB);
    const wm = (await W.get("/api/me")).data;
    check("a woman is free forever after sign-up", wm?.membership?.state === "FREE_FOREVER" && wm.user.planCode === "VIP" && !wm.membership.price, wm?.membership);
    check("…with every feature on", wm?.features?.seeWhoLiked === true && wm.features.incognito === true, wm?.features);
    const wc = (await W.get("/api/billing/catalogue")).data;
    check("there's nothing for her to buy", wc?.freeForever === true && wc.plans.length === 0 && wc.passes.length === 0, { free: wc?.freeForever, plans: wc?.plans?.length });
    const wbuy = await W.post("/api/billing/checkout", { planCode: "PREMIUM", acceptTerms: true, expectedTodayMinor: 5000 });
    check("…and checkout refuses to charge her", wbuy.status === 409 && wbuy.data?.code === "free_forever", wbuy.data);
    check("no payment details were needed", ((await W.get("/api/billing/subscription")).data?.payments ?? []).length === 0);

    const mm = (await Mn.get("/api/me")).data;
    const days = mm?.membership?.endsAt ? Math.round((new Date(mm.membership.endsAt).getTime() - Date.now()) / 86_400_000) : 0;
    check("a man gets a 15-day free trial", mm?.membership?.state === "FREE_TRIAL" && days >= 14 && days <= 15 && mm.user.planCode === "PREMIUM", mm?.membership);
    check("the trial end date is shown", /free trial ends on/.test(mm?.membership?.note ?? ""), mm?.membership?.note);
    check("and the price after it: ₹100/month", /₹100(\.00)?\/month/.test(mm?.membership?.price ?? ""), mm?.membership?.price);
    const mc = (await Mn.get("/api/billing/catalogue")).data;
    const prem = mc?.plans?.find((p: any) => p.code === "PREMIUM");
    check("men can choose 1, 3, 6 or 12 months", JSON.stringify((prem?.options ?? []).map((o: any) => [o.durationDays, o.quote.todayMinor])) === JSON.stringify([[30, 10000], [90, 25000], [180, 50000], [365, 100000]]), prem?.options?.map((o: any) => [o.durationDays, o.quote.todayMinor]));
    check("no ₹1 intro offer any more", !prem?.quote?.offer || prem.quote.offer.kind !== "INTRO", prem?.quote?.offer);
    const welcome = ((await Mn.get("/api/notifications")).data?.notifications ?? []).find((n: any) => /free trial has started/.test(n.title));
    check("he's told the trial is free and nothing is charged automatically", /nothing is charged/.test(welcome?.body ?? ""), welcome);

    // Gender changes: man → woman doesn't unlock free-forever until a selfie is verified; woman → man ends it.
    const prof = async (c: Client, gender: string, name: string) => c.put("/api/profile", {
      firstName: name, gender, bio: "Test account for the end-to-end journey. Enjoys board games, chai and long walks in Lodhi Garden.", city: "Delhi", intent: "FRIENDS",
      education: "Master's degree", profession: "QA engineer", heightCm: 170, drinking: "SOCIAL", smoking: "NEVER", food: "VEG", exercise: "SOMETIMES", pets: "WANTS",
      interests: ["board_games", "coffee", "trekking", "reading"], prompts: [{ q: "A perfect first date for me is", a: "a slow walk and good chai" }],
    });
    await prof(Mn, "WOMAN", "Arjun");
    check("switching the profile to woman doesn't unlock free-forever by itself", (await Mn.get("/api/me")).data?.membership?.state !== "FREE_FOREVER");
    await prof(W, "MAN", "Kiran");
    check("switching to man ends free-forever", (await W.get("/api/me")).data?.membership?.state !== "FREE_FOREVER");
  }

  section("Privacy by design: consent records, legal drafts, privacy controls");
  // Names set the test IP (x-forwarded-for), so these use lengths nothing else uses (sign-up is rate-limited per IP).
  const P1 = new Client("PrivacyOne123"), P2 = new Client("PrivacyTwo1234"), P4 = new Client("PrivacyFour1234"), P3 = new Client("PrivacyThree1234");
  const viewer = new Client("PrivacyOutsider123");
  const p1Id = await onboard(P1, `priv1-${run}@test.local`, "WOMAN", "MAN", "Ira", answersA);
  const p2Id = await onboard(P2, `priv2-${run}@test.local`, "MAN", "WOMAN", "Dev", answersB);
  const p4Id = await onboard(P4, `priv4-${run}@test.local`, "WOMAN", "MAN", "Mira", answersA);
  {
    const mk = await new Client("MarketingOne12345").post("/api/auth/register", { email: `mkt-${run}@test.local`, password: "Testing123", dob: "1994-02-02", acceptLegal: true, confirmAdult: true, safetyAcknowledged: true, marketing: true });
    const mkc = new Client("MarketingOne12345"); await mkc.post("/api/auth/login", { email: `mkt-${run}@test.local`, password: "Testing123" });
    const cons = (await mkc.get("/api/consents")).data;
    const cur = (k: string) => cons?.current?.find((x: any) => x.kind === k);
    check("sign-up records terms, privacy, age and safety consent with the version", mk.status === 201 && cur("TERMS")?.granted && /^terms@v\d+$/.test(cur("TERMS")?.version ?? "") && cur("PRIVACY")?.granted && cur("AGE_18")?.granted && cur("SAFETY_RULES")?.granted, cons?.current);
    check("optional marketing is recorded only when ticked", cur("MARKETING")?.granted === true);
    const p1c = (await P1.get("/api/consents")).data;
    check("…and is off when not ticked (never pre-selected)", p1c?.current?.find((x: any) => x.kind === "MARKETING")?.granted === false);
    const off = await mkc.post("/api/consents", { kind: "MARKETING", granted: false });
    check("marketing can be withdrawn, keeping the history", off.status === 200 && off.data.history.filter((h: any) => h.kind === "MARKETING").length === 2, off.data?.history);
    check("required consents can't be withdrawn without deleting the account", (await mkc.post("/api/consents", { kind: "TERMS", granted: false })).data?.code === "required_consent");
    const t = (await anon.get("/api/legal/privacy")).data;
    check("the Privacy Policy is a real draft filled from live settings", /How long we keep data/.test(t?.body ?? "") && !/\{\{/.test(t?.body ?? "") && /Messages in chats that have ended/.test(t?.body ?? ""), t?.body?.slice(0, 200));
    check("…and says it hasn't been reviewed by a lawyer yet", t?.lawyerReviewed === false);
    const tos = (await anon.get("/api/legal/terms")).data?.body ?? "";
    check("the Terms cover prohibited conduct, appeals, liability and governing law", ["harass", "Appeals", "Limitation of liability", "Disputes and governing law", "Changes to these terms"].every((w) => tos.includes(w)));
    check("service providers page is public", (await fetch(`${BASE}/legal/service-providers`)).status === 200);
    const ret = (await anon.get("/api/privacy/retention")).data;
    check("the retention schedule is public and covers each kind of data", ret?.schedule?.length >= 12 && ret.schedule.some((r: any) => /Payment records/.test(r.what)), ret?.schedule?.length);
  }
  // Match P2 with P1 and with P4.
  for (const [a, b, bid, aid] of [[P2, P1, p1Id, p2Id], [P2, P4, p4Id, p2Id]] as const) {
    await a.post("/api/likes", { toId: bid, kind: "LIKE" });
    await b.post("/api/likes", { toId: aid, kind: "LIKE" });
  }
  const m12 = ((await P1.get("/api/matches")).data?.matches ?? []).find((m: any) => m.other?.id === p2Id)?.id;
  const m24 = (await P4.get("/api/matches")).data?.matches?.[0]?.id;
  check("test members matched", !!m12 && !!m24, { m12, m24 });
  {
    await P1.put("/api/preferences", { photosVisibility: "MATCHES", showCity: false });
    const card = (await P2.get(`/api/matches/${m12}`)).data;
    const c = card?.other;
    check("a match still sees every photo with “matches only”", c && !c.morePhotosForMatches, c?.morePhotosForMatches);
    check("hiding the city shows only the country", c?.city === "India", c?.city);
    await onboard(viewer, `privout-${run}@test.local`, "MAN", "WOMAN", "Out", answersB);
    const seen = (await viewer.get("/api/discovery?mode=new")).data?.cards ?? [];
    const ira = seen.find((x: any) => x.id === p1Id);
    check("non-matches see one photo at most and a rounded distance", !ira || ((ira.photos?.length ?? 0) <= 1 && /^(Within \d+ km|About \d+ km away|\d+\+ km away|Distance hidden)$/.test(ira.distance)), ira && { photos: ira.photos?.length, distance: ira.distance });
    check("no coordinates, email, phone or date of birth in discovery", !JSON.stringify(seen).match(/"(lat|lng|email|phone|dob)"/));
    await P4.post("/api/privacy/pause", { paused: true });
    const again = ((await viewer.get("/api/discovery?mode=new")).data?.cards ?? []);
    check("a paused profile disappears from Discover", !again.some((x: any) => x.id === p4Id));
    check("…can't be liked", (await viewer.post("/api/likes", { toId: p4Id, kind: "LIKE" })).status === 404);
    check("…and can't get new messages", (await P2.post(`/api/matches/${m24}/messages`, { body: "Hi Mira!" })).data?.code === "other_paused");
    check("/me shows the pause", (await P4.get("/api/me")).data?.user?.paused === true);
    await P4.post("/api/privacy/pause", { paused: false });
    await P1.put("/api/preferences", { photosVisibility: "EVERYONE", showCity: true });
  }

  section("Messaging safety: risky links, code requests, mute, mass messaging");
  {
    check("shortened links can't be sent", (await P2.post(`/api/matches/${m12}/messages`, { body: "look at bit.ly/xyz123" })).data?.code === "risky_link");
    check("app files can't be sent", (await P2.post(`/api/matches/${m12}/messages`, { body: "install kinara-gold.apk" })).data?.code === "risky_link");
    const ask = await P2.post(`/api/matches/${m12}/messages`, { body: "can you send me the OTP you just got" });
    check("asking for a one-time code is flagged (sent, but warned)", ask.status === 201 && ask.data?.flagged === true, ask.data);
    const got = (await P1.get(`/api/matches/${m12}/messages`)).data?.messages ?? [];
    check("the recipient sees a warning about codes and PINs", got.some((m: any) => /one-time codes, PINs/.test(m.warning ?? "")), got.map((m: any) => m.warning));
    const dec = (await P2.get("/api/privacy/decisions")).data;
    check("the sender can see the automated decision and that a person will review it", dec?.decisions?.some((d: any) => d.kind === "MESSAGE_FLAG" && /person will review/.test(d.reason)), dec);
    const mute = await P1.post(`/api/matches/${m12}/mute`, { muted: true });
    check("a chat can be muted", mute.data?.muted === true && (await P1.get(`/api/matches/${m12}/messages`)).data?.muted === true);
    const before = ((await P1.get("/api/notifications")).data?.notifications ?? []).length;
    await P1.post(`/api/matches/${m12}/messages`, { body: "Hey Dev" });
    await P2.post(`/api/matches/${m12}/messages`, { body: "Hey Ira, how was your day?" });
    const after = ((await P1.get("/api/notifications")).data?.notifications ?? []).length;
    check("…and then sends no message notifications", after === before, { before, after });
    await P1.post(`/api/matches/${m12}/mute`, { muted: false });
    await admin.put("/api/admin/config", { config: { "chat.massMessagingMatches": 1 } });
    const mass = await P2.post(`/api/matches/${m24}/messages`, { body: "Hi Mira, nice to match!" });
    check("starting many chats within minutes is slowed down", mass.status === 429 && mass.data?.code === "mass_messaging", mass.data);
    await admin.put("/api/admin/config", { config: { "chat.massMessagingMatches": 15 } });
    check("…normal pace is fine again", (await P2.post(`/api/matches/${m24}/messages`, { body: "Hi Mira, nice to match!" })).status === 201);
  }

  section("Reports, escalation, restriction and appeals");
  {
    const r1 = await P1.post("/api/reports", { reportedId: p2Id, category: "UNDERAGE", details: "Says he's 16 in chat", alsoBlock: false });
    check("a report gets a case number and a clear confirmation", r1.status === 201 && /^KN-R-\d{4}-[2-9A-HJ-NP-Z]{6}$/.test(r1.data?.caseNo ?? "") && /Your report has been received/.test(r1.data?.message ?? ""), r1.data);
    check("the reporter's list shows the case number", ((await P1.get("/api/reports")).data?.reports ?? []).some((r: any) => r.caseNo === r1.data?.caseNo));
    check("one report about age doesn't restrict anyone by itself", (await P2.get("/api/me")).data?.user?.restricted === false);
    await P4.post("/api/reports", { reportedId: p2Id, category: "UNDERAGE", details: "Looks very young", alsoBlock: false });
    const me2 = (await P2.get("/api/me")).data?.user;
    check("two people reporting a possible minor restricts the account while it's checked", me2?.restricted === true && me2.status === "ACTIVE", me2);
    const looker = new Client("PrivacyWomanLooker1");
    await onboard(looker, `privlook-${run}@test.local`, "WOMAN", "MAN", "Lia", answersA);
    const lookCards = (await looker.get("/api/discovery?mode=new")).data?.cards;
    check("…hidden from Discover", Array.isArray(lookCards) && !lookCards.some((x: any) => x.id === p2Id), lookCards?.length);
    check("…can't like anyone new", (await P2.post("/api/likes", { toId: p1Id, kind: "LIKE" })).data?.code === "restricted");
    check("…can't send call requests", (await P2.post("/api/call-requests", { matchId: m12, kind: "AUDIO" })).data?.code === "restricted");
    check("…but can still reply in existing chats", (await P2.post(`/api/matches/${m12}/messages`, { body: "I'm 29, happy to verify" })).status === 201);
    const ap = await P2.post("/api/appeals", { kind: "RESTRICTION", details: "I'm 29 and happy to show ID or do the selfie check. Please review." });
    check("the person can appeal and gets a case number", ap.status === 201 && /^KN-A-/.test(ap.data?.caseNo ?? ""), ap.data);
    check("…only one open appeal of the same kind", (await P2.post("/api/appeals", { kind: "RESTRICTION", details: "Second appeal about the very same thing, please." })).status === 409);
    const queue = (await admin.get("/api/admin/appeals")).data?.appeals ?? [];
    const mine = queue.find((a: any) => a.caseNo === ap.data?.caseNo);
    check("staff see the appeal with the automated decision history", mine && mine.automated.some((d: any) => d.kind === "RESTRICTION"), mine);
    check("a decision needs an explanation", (await admin.post(`/api/admin/appeals/${mine?.id}`, { outcome: "OVERTURNED", decision: "ok" })).status === 422);
    const dec = await admin.post(`/api/admin/appeals/${mine?.id}`, { outcome: "OVERTURNED", decision: "Checked the profile: the member is an adult. Restriction lifted." });
    check("overturning the appeal lifts the restriction", dec.status === 200 && (await P2.get("/api/me")).data?.user?.restricted === false, dec.data);
    check("the member sees the outcome", ((await P2.get("/api/appeals")).data?.appeals ?? []).some((a: any) => a.caseNo === ap.data?.caseNo && a.status === "OVERTURNED"));

    // Four-eyes: whoever suspended someone can't decide their appeal.
    const p3Id = await onboard(P3, `priv3-${run}@test.local`, "MAN", "WOMAN", "Raj", answersB);
    await admin.post(`/api/admin/users/${p3Id}`, { action: "SUSPEND", reason: "E2E: suspected spam" });
    const ap3 = await P3.post("/api/appeals", { kind: "SUSPENSION", details: "I wasn't spamming anyone, I only sent a few messages to my matches." });
    check("a suspended member can still appeal", ap3.status === 201, ap3.data);
    const q3 = ((await admin.get("/api/admin/appeals")).data?.appeals ?? []).find((a: any) => a.caseNo === ap3.data?.caseNo);
    check("the staff member who suspended can't decide the appeal", (await admin.post(`/api/admin/appeals/${q3?.id}`, { outcome: "OVERTURNED", decision: "Reviewed my own decision." })).data?.code === "four_eyes");
    const by2 = await mod.post(`/api/admin/appeals/${q3?.id}`, { outcome: "OVERTURNED", decision: "Second reviewer: messages were normal. Account restored." });
    check("a different moderator can, and overturning restores the account", by2.status === 200 && (await P3.get("/api/me")).data?.user?.status === "ACTIVE", by2.data);
    const banned = await anon.post("/api/appeals", { kind: "BAN", email: `someone-${run}@test.local`, details: "My account was banned and I can't sign in. I think it was a mistake." });
    check("someone who can't sign in can appeal with their email", banned.status === 201, banned.data);
    check("…but must give an email", (await anon.post("/api/appeals", { kind: "BAN", details: "I can't sign in and want to appeal my ban please." })).status === 422);
  }

  section("Staff security, compliance layer, legal holds, launch readiness");
  {
    const st = (await admin.get("/api/staff/unlock")).data;
    check("staff are unlocked straight after signing in", st?.unlocked === true, st);
    check("members can't use the staff unlock", (await P1.get("/api/staff/unlock")).status === 403);
    check("unlocking needs the right password (test mode without 2-step)", (await admin.post("/api/staff/unlock", { password: "wrong-one-123" })).status === 401);
    check("…and works with it", (await admin.post("/api/staff/unlock", { password: ADMIN_PASSWORD })).status === 200);
    const comp = (await admin.get("/api/admin/compliance")).data;
    check("the audit trail is a verified hash chain", comp?.auditChain?.ok === true && comp.auditChain.checked > 20, comp?.auditChain);
    check("country rules come from configuration", comp?.countries?.IN?.minAge === 18 && comp.countries.JP?.ageAssurance === "SELFIE_REQUIRED" && comp.countries.AE?.launchEnabled === false, comp?.countries?.IN);
    check("every outside service is listed with its data and status", comp?.vendors?.some((v: any) => v.id === "render" && v.active) && comp.vendors.every((v: any) => v.data && v.where), comp?.vendors?.length);
    const dubai = await P1.put("/api/profile", { firstName: "Ira", gender: "WOMAN", city: "Dubai", intent: "FRIENDS", bio: "Moving soon and checking what changes." });
    check("sign-ups are refused in countries not open yet", dubai.data?.code === "country_unavailable", dubai.data);
    const hold = await admin.post("/api/admin/legal-holds", { userId: p2Id, kind: "LAWFUL_REQUEST", reason: "E2E: preservation request from an authority", reference: `REQ-${run}` });
    check("staff can place a legal hold", hold.status === 201);
    check("…which shows in compliance", ((await admin.get("/api/admin/compliance")).data?.holds ?? []).some((h: any) => h.userId === p2Id));
    check("…and can be released", (await admin.del(`/api/admin/legal-holds/${hold.data?.hold?.id}`)).status === 200);
    check("members can't place holds", (await P1.post("/api/admin/legal-holds", { userId: p2Id, kind: "SAFETY", reason: "I am not staff at all here" })).status === 403);
    const launch = (await admin.get("/api/admin/launch")).data;
    check("launch readiness flags sample accounts and unreviewed legal text", launch?.ready === false && launch.checks.some((c: any) => c.id === "samples" && !c.ok) && launch.checks.some((c: any) => c.id === "legaldocs" && !c.ok), launch?.checks?.filter((c: any) => !c.ok).map((c: any) => c.id));
    check("…and lists the security tests to do before launch", launch?.items?.some((i: any) => i.label === "Location leakage") && launch.items.some((i: any) => i.label === "Call-request bypass attempts"));
    check("a sign-off needs who did it", (await admin.put("/api/admin/launch", { id: "legal.1", status: "DONE", by: "" })).status === 422);
    const so = await admin.put("/api/admin/launch", { id: "legal.1", status: "DONE", by: "E2E Law Chambers", note: "test" });
    check("…and is recorded", so.status === 200 && ((await admin.get("/api/admin/launch")).data?.items ?? []).find((i: any) => i.id === "legal.1")?.by === "E2E Law Chambers");
    check("only staff who can change settings may sign off", (await mod.put("/api/admin/launch", { id: "legal.2", status: "DONE", by: "Me" })).status === 403);
    await admin.put("/api/admin/launch", { id: "legal.1", status: "OPEN", by: "" });
    const legal2 = (await admin.get("/api/admin/legal")).data?.documents?.find((d: any) => d.slug === "cookies");
    const pub = legal2?.versions?.find((v: any) => v.status === "PUBLISHED");
    check("a lawyer review can't be recorded without a name", (await admin.post(`/api/admin/legal/${pub?.id}`, { action: "record_lawyer_review" })).status === 422);
    await admin.post(`/api/admin/legal/${pub?.id}`, { action: "record_lawyer_review", reviewer: "E2E Law Chambers" });
    check("once recorded, the public page drops the draft notice", (await anon.get("/api/legal/cookies")).data?.lawyerReviewed === true);
    const job = await fetch(`${BASE}/api/cron/billing`, { method: "POST", headers: { "x-cron-secret": envVal("CRON_SECRET") } }).then((r) => r.json());
    check("the retention job reports each category it cleaned", job?.retention && "endedChatMessagesDeleted" in job.retention && "callRecordsDeleted" in job.retention && "auditLogsDeleted" in job.retention, job?.retention);
    check("the audit chain is still intact after all of that", (await admin.get("/api/admin/compliance")).data?.auditChain?.ok === true);
  }

  section("Flirting: Sparks, Super Likes, winks, hearts, reactions, Cupid, Love Moment");
  {
    const F1 = new Client("FlirtyOneClient12345"), F2 = new Client("FlirtyTwoClient123456");
    const f1 = await onboard(F1, `flirt1-${run}@test.local`, "WOMAN", "MAN", "Asha", answersA);
    const f2 = await onboard(F2, `flirt2-${run}@test.local`, "MAN", "WOMAN", "Kabir", answersB);
    const sp = await F2.post("/api/likes", { toId: f1, kind: "SPARK" });
    check("a Spark is sent", sp.status === 200 && sp.data?.matched === false, sp.data);
    const n1 = ((await F1.get("/api/notifications")).data?.notifications ?? [])[0];
    check("…and arrives as “Someone sent you a Spark ✨”", n1?.title === "Someone sent you a Spark ✨", n1);
    const lk = ((await F1.get("/api/likes")).data?.cards ?? []).find((x: any) => x.id === f2);
    check("a Spark shows who sent it, even on the free plan", lk?.likeKind === "SPARK", lk?.likeKind);
    check("the Love Moment counts real likes from the last day", (await F1.get("/api/me")).data?.moment?.newLikes24h >= 1);
    const back = await F1.post("/api/likes", { toId: f2, kind: "LIKE" });
    check("liking back a Spark makes a match", back.data?.matched === true, back.data);
    const mid = back.data?.matchId;
    const mn = ((await F2.get("/api/notifications")).data?.notifications ?? []).find((x: any) => x.type === "MATCH");
    check("the match notification says “You have a new match! 💕”", mn?.title === "You have a new match! 💕", mn);
    const w = await F1.post(`/api/matches/${mid}/flirt`, { kind: "WINK" });
    check("a wink can be sent in the chat", w.status === 201, w.data);
    const wn = ((await F2.get("/api/notifications")).data?.notifications ?? [])[0];
    check("…the other person hears “Asha sent you a wink 😉”", wn?.title === "Asha sent you a wink 😉", wn);
    await F1.post(`/api/matches/${mid}/flirt`, { kind: "HEART" });
    await F1.post(`/api/matches/${mid}/flirt`, { kind: "WINK" });
    check("winks and hearts are capped until the other person replies", (await F1.post(`/api/matches/${mid}/flirt`, { kind: "HEART" })).data?.code === "awaiting_reply");
    const msgs = (await F2.get(`/api/matches/${mid}/messages`)).data?.messages ?? [];
    check("winks and hearts show in the chat as their own kind", msgs.filter((m: any) => m.kind === "WINK").length === 2 && msgs.some((m: any) => m.kind === "HEART" && m.body === "❤️"));
    const reply = await F2.post(`/api/matches/${mid}/messages`, { body: "Haha, hi Asha! How's your week going?" });
    check("…and a reply opens it up again", reply.status === 201 && (await F1.post(`/api/matches/${mid}/flirt`, { kind: "HEART" })).status === 201);
    const r1 = await F1.post(`/api/messages/${reply.data.id}/react`, { on: true, emoji: "🔥" });
    check("messages take 🔥 and other reactions", r1.data?.emoji === "🔥");
    check("…but only the five reactions", (await F1.post(`/api/messages/${reply.data.id}/react`, { on: true, emoji: "🍆" })).status === 422);
    const seen = ((await F2.get(`/api/matches/${mid}/messages`)).data?.messages ?? []).find((m: any) => m.id === reply.data.id);
    check("the other person sees the reaction", seen?.reactions?.theirs === "🔥", seen?.reactions);
    const cup = await F2.post("/api/cupid", { task: "reply", matchId: mid });
    check("Cupid suggests replies, labelled as automatic", cup.data?.ideas?.length >= 2 && /automatic suggestions/.test(cup.data.note), cup.data);
    const op = await F2.post("/api/cupid", { task: "opener", matchId: mid });
    check("Cupid suggests openers", op.data?.ideas?.length >= 3);
    check("Cupid suggests date ideas in public places", ((await F2.post("/api/cupid", { task: "date", matchId: mid })).data?.ideas ?? []).every((i: any) => /public/.test(i.why)));
    check("Cupid helps with a bio", ((await F1.post("/api/cupid", { task: "bio" })).data?.ideas ?? []).length === 3);
    check("Cupid only works inside your own matches", (await new Client("FlirtyStrangerClient9").post("/api/cupid", { task: "reply", matchId: mid })).status === 401);
    const bs = (await F1.get("/api/boosts")).data;
    check("boosts come with the plan (women: free forever, VIP)", bs?.perMonth >= 1 && bs.left === bs.perMonth, bs);
    const bst = await F1.post("/api/boosts");
    check("a boost starts for 30 minutes", bst.status === 201 && !!bst.data?.activeUntil && bst.data.left === bs.perMonth - 1, bst.data);
    check("…only one at a time", (await F1.post("/api/boosts")).data?.code === "boost_active");
    const tr = await F1.put("/api/travel", { city: "Mumbai", days: 7 });
    check("travel mode can be switched on (included for her)", tr.status === 200 && tr.data?.city === "Mumbai", tr.data);
    const asSeen = (await F2.get(`/api/people/${f1}`)).data?.card;
    check("…her match sees 'Visiting Mumbai'", asSeen?.city === "Visiting Mumbai", asSeen?.city);
    check("travel mode needs Premium Plus on a men's trial", (await F2.put("/api/travel", { city: "Pune", days: 3 })).data?.code === "upgrade_required");
    check("unknown cities are refused", (await F1.put("/api/travel", { city: "Atlantis" })).status === 422);
    await F1.put("/api/travel", { city: null });
    check("a profile can be opened by id after the app restarts (matches)", (await F2.get(`/api/people/${f1}`)).data?.matchId === mid);
    check("…but not by someone who couldn't see them in Discover anyway", (await P4.get(`/api/people/${f1}`)).status === 404);
    const sup = await F2.post("/api/likes", { toId: p1Id, kind: "PRIORITY", note: "Love your taste in films" });
    check("a Super Like arrives as “You received a Super Like ⭐”", sup.status === 200 && (((await P1.get("/api/notifications")).data?.notifications ?? []).some((n: any) => n.title === "You received a Super Like ⭐")), sup.data);
  }

  section("Advertising: business accounts, review, serving, privacy, billing");
  {
    // Earlier runs leave campaigns live in the dev database: pause them so this run's ads are the ones served.
    for (const c of ((await admin.get("/api/admin/ads")).data?.campaigns ?? []).filter((c: any) => c.status === "ACTIVE"))
      await admin.post(`/api/admin/ads/campaigns/${c.id}`, { action: "pause", note: "e2e clean-up" });
    check("the 'Advertise with us' page is public", (await fetch(`${BASE}/advertise`)).status === 200);
    const meta = await anon.get("/api/ads/meta");
    check("the ad builder options include Delhi NCR and the 8 objectives and CTAs", meta.data?.regions?.["Delhi NCR"]?.includes("Delhi") && Object.keys(meta.data.objectives).length === 8 && Object.keys(meta.data.ctas).length === 8, meta.data);
    const Adv = new Client("AdvertiserClientOne1");
    const base = { businessName: `Chai & Candles ${run}`, contactName: "Meera Shah", email: `ads-${run}@business.test`, phone: "+91 98100 00000", category: "FOOD", website: "https://chai-candles.example.com", password: "Business123", acceptTerms: true };
    check("advertisers must accept the Advertising Terms", (await anon.post("/api/ads/register", { ...base, acceptTerms: false })).status === 422);
    check("…and use https websites", (await anon.post("/api/ads/register", { ...base, website: "http://x.example.com" })).status === 422);
    const reg = await Adv.post("/api/ads/register", base);
    check("a business account is created and sent to /ads", reg.status === 201 && reg.data?.next === "/ads", reg.data);
    check("the email can't be reused", (await anon.post("/api/ads/register", base)).status === 409);
    check("logging in sends a business account to /ads", (await new Client("AdvLogin1").post("/api/auth/login", { email: base.email, password: base.password })).data?.next === "/ads");
    await Adv.post("/api/auth/otp", { action: "verify", channel: "EMAIL", code: reg.data?.devOtp });

    section("Advertising: advertisers never reach member data, members never reach advertiser tools");
    const W = new Client("AdMemberWomanClient1"), M = new Client("AdMemberManClient12");
    const wId = await onboard(W, `adw-${run}@test.local`, "WOMAN", "MAN", "Riya", answersA);
    const mId = await onboard(M, `adm-${run}@test.local`, "MAN", "WOMAN", "Dev", answersB);
    for (const path of ["/api/discovery", `/api/people/${wId}`, "/api/matches", "/api/likes", "/api/admin/ads", "/api/admin/users"])
      check(`advertiser is refused ${path}`, [403].includes((await Adv.get(path)).status));
    check("…with a clear 'business account' message", (await Adv.get("/api/discovery")).data?.code === "advertiser_only");
    check("a member can't open advertiser tools", (await W.get("/api/ads/account")).data?.code === "not_advertiser" && (await W.post("/api/ads/campaigns", {})).status === 403);
    check("signed-out people can't either", (await anon.get("/api/ads/account")).status === 401);
    check("members can't open the staff ads queue", (await W.get("/api/admin/ads")).status === 403);

    section("Advertising: creative upload and automatic checks");
    const img = await Adv.upload("/api/ads/creatives", { file: jpeg, kind: "image" });
    check("an ad image is uploaded and re-encoded", img.status === 201 && /\.webp$/.test(img.data?.key ?? ""), img.data);
    const fakeVid = await Adv.upload("/api/ads/creatives", { file: Buffer.from("not a video at all, just text pretending"), kind: "video" });
    check("a fake video is refused", fakeVid.status === 422, fakeVid.data);
    check("a fake image is refused", (await Adv.upload("/api/ads/creatives", { file: Buffer.from("<script>alert(1)</script>"), kind: "image" })).status === 422);
    const creative = { headline: "Candlelit dinner for two", description: "20% off this weekend at our Hauz Khas café.", cta: "BOOK_NOW", url: "https://chai-candles.example.com/offer", imageKeys: [img.data?.key] };
    const camp = (over: object = {}) => ({ name: `Weekend offer ${run}`, objective: "WEBSITE", placements: ["FEED"], pricing: "CPM", dailyBudgetMinor: 50000, totalBudgetMinor: 1000000, targeting: { countries: ["IN"], regions: ["Delhi NCR"], ageMin: 21, ageMax: 45 }, creative, ...over });
    const bad = await Adv.post("/api/ads/campaigns", camp({ name: `Scam ${run}`, creative: { ...creative, headline: "Guaranteed returns, double your money" } }));
    const badSub = await Adv.post(`/api/ads/campaigns/${bad.data?.campaign?.id}/submit`);
    check("a prohibited ad is rejected automatically with a general reason", badSub.data?.status === "REJECTED" && /does not meet our advertising guidelines/.test(badSub.data?.message), badSub.data);
    check("short links are refused", (await Adv.post(`/api/ads/campaigns`, camp({ creative: { ...creative, url: "https://bit.ly/abc" } })).then((r) => Adv.post(`/api/ads/campaigns/${r.data?.campaign?.id}/submit`))).data?.status === "REJECTED");
    check("sensitive targeting isn't even possible", (await Adv.post("/api/ads/campaigns", camp({ targeting: { religion: ["X"], ageMin: 16 } }))).status === 422);
    const reach = await Adv.post("/api/ads/reach", { regions: ["Delhi NCR"], ageMin: 21, ageMax: 45 });
    check("estimated reach is a rounded range, never an exact small number", /^(About [\d,]+ people|Fewer than 100 people)$/.test(reach.data?.audience ?? ""), reach.data);

    section("Advertising: review, verification and payment");
    const c1 = await Adv.post("/api/ads/campaigns", camp());
    const cid = c1.data?.campaign?.id;
    check("a campaign starts as a draft", c1.status === 201 && c1.data.campaign.status === "DRAFT", c1.data);
    check("drafts are not shown to anyone", (await W.get("/api/ads/serve?placement=FEED")).data?.ad?.id !== cid);
    const sub = await Adv.post(`/api/ads/campaigns/${cid}/submit`);
    check("submitting sends it to Pending Review", sub.data?.status === "PENDING_REVIEW", sub.data);
    const q1 = (await admin.get("/api/admin/ads")).data?.pending?.find((p: any) => p.id === cid);
    check("staff see it in the review queue with business details and landing page", q1?.advertiser?.businessName === base.businessName && q1.creative.url === creative.url && q1.images.length === 1, q1);
    check("ads need a verified business before approval", (await admin.post(`/api/admin/ads/campaigns/${cid}`, { action: "approve" })).data?.code === "unverified");
    check("…and a balance", (await admin.post(`/api/admin/ads/campaigns/${cid}`, { action: "approve", verifyAdvertiser: true })).data?.code === "balance");
    check("a top-up below the minimum is refused", (await Adv.post("/api/ads/topups", { amountMinor: 1000 })).data?.code === "min_topup");
    const tu = await Adv.post("/api/ads/topups", { amountMinor: 200000 });
    check("a top-up starts (test mode here)", tu.status === 201 && tu.data?.provider === "TEST", tu.data);
    const tc = await Adv.post(`/api/ads/topups/${tu.data?.id}`, { test: true });
    check("…and is credited with a receipt number", tc.data?.status === "PAID" && /^KN-AD-\d{4}-\d{5}$/.test(tc.data?.receiptNo ?? ""), tc.data);
    check("confirming twice doesn't double the balance", (await Adv.post(`/api/ads/topups/${tu.data?.id}`, { test: true })).status === 200 && (await Adv.get("/api/ads/account")).data?.advertiser?.balanceMinor === 200000);
    const rc = await fetch(`${BASE}/api/ads/receipts/${tu.data?.id}`, { headers: { cookie: Adv.cookie } });
    check("the receipt downloads as a PDF", rc.status === 200 && rc.headers.get("content-type") === "application/pdf");
    check("nobody else can download it", (await fetch(`${BASE}/api/ads/receipts/${tu.data?.id}`, { headers: { cookie: W.cookie } })).status === 403);
    const ap = await admin.post(`/api/admin/ads/campaigns/${cid}`, { action: "approve", verifyAdvertiser: true, note: "Checked GST and website (e2e)" });
    check("approved: the business is verified and the campaign goes live", ap.data?.status === "ACTIVE" && (await Adv.get("/api/ads/account")).data?.advertiser?.verification === "VERIFIED", ap.data);
    check("the advertiser is told", ((await Adv.get("/api/notifications")).data?.notifications ?? []).some((n: any) => /approved/.test(n.title)));

    section("Advertising: what members see");
    const s1 = await W.get("/api/ads/serve?placement=FEED");
    const ad = s1.data?.ad;
    check("a member in Delhi gets the ad, labelled Sponsored", ad?.id === cid && ad.label === "Sponsored" && ad.advertiser.name === base.businessName && ad.advertiser.verified === true, s1.data);
    check("the ad carries no targeting, budget or advertiser contact details", ad && !("targeting" in ad) && !JSON.stringify(ad).includes(base.email) && !JSON.stringify(ad).includes("dailyBudget"));
    check("'Why am I seeing this?' names broad reasons only", /Delhi NCR/.test(ad?.why ?? "") && /never see who you are/.test(ad?.why ?? ""), ad?.why);
    check("ads are never served for chats or calls", (await W.get("/api/ads/serve?placement=CHAT")).status === 422);
    check("an advertiser account gets no ads", (await Adv.get("/api/ads/serve?placement=FEED")).status === 200 && (await Adv.get("/api/ads/serve?placement=FEED")).data?.ad === null);
    let counted = 0;
    for (let i = 0; i < 5; i++) if ((await W.post("/api/ads/events", { token: ad.token, kind: "IMPRESSION" })).data?.counted) counted++;
    check("the same ad counts at most 3 times a day for one member", counted === 3, counted);
    check("…and isn't served again today after that", (await W.get("/api/ads/serve?placement=FEED")).data?.ad?.id !== cid);
    check("a forged ad token is refused", (await anon.post("/api/ads/events", { token: ad.token.slice(0, -2) + "xx", kind: "IMPRESSION" })).status === 400);
    const click = await fetch(`${BASE}/api/ads/click?t=${encodeURIComponent(ad.token)}`, { redirect: "manual" });
    const loc = click.headers.get("location") ?? "";
    check("a click goes to the advertiser with only a random click code", click.status === 302 && loc.startsWith(creative.url) && /kn_click=[\w-]{10,}/.test(loc) && !loc.includes(wId), loc);
    const clickId = new URL(loc).searchParams.get("kn_click");
    const convKey = (await Adv.get(`/api/ads/campaigns/${cid}`)).data?.campaign?.conversionKey;
    check("a conversion needs the campaign's key", (await anon.post(`/api/ads/convert?key=wrong&click=${clickId}`)).data?.counted === false);
    check("a conversion is recorded once", (await anon.post(`/api/ads/convert?key=${convKey}&click=${clickId}`)).data?.counted === true && (await anon.post(`/api/ads/convert?key=${convKey}&click=${clickId}`)).data?.counted === false);
    const pix = await fetch(`${BASE}/api/ads/convert?key=${convKey}&click=${clickId}`);
    check("the conversion pixel works as an image", pix.status === 200 && pix.headers.get("content-type") === "image/gif");
    const st = await Adv.get(`/api/ads/campaigns/${cid}`);
    const tot = st.data?.stats?.totals;
    check("the advertiser sees totals: 3 impressions, 1 person, 1 click, 1 conversion", tot?.impressions === 3 && tot.reach === 1 && tot.clicks === 1 && tot.conversions === 1 && tot.ctr === 33.33, tot);
    check("CPM is charged per view (₹100 per 1,000 → 3 × ₹0.10)", tot?.spendMinor === 30 && (await Adv.get("/api/ads/account")).data?.advertiser?.balanceMinor === 200000 - 30, tot);
    const statsJson = JSON.stringify(st.data);
    check("advertiser statistics contain no member identity", !statsJson.includes(wId) && !statsJson.includes(`adw-${run}`) && !statsJson.includes("Riya"));
    check("the advertiser's dashboard shows campaign counts and balance", (await Adv.get("/api/ads/account")).data?.counts?.active >= 1);

    section("Advertising: hide, report, personalised ads");
    const c2 = await Adv.post("/api/ads/campaigns", camp({ name: `Banner for men ${run}`, placements: ["BANNER"], targeting: { genders: ["MAN"] } }));
    const c2id = c2.data?.campaign?.id;
    await Adv.post(`/api/ads/campaigns/${c2id}/submit`);
    await admin.post(`/api/admin/ads/campaigns/${c2id}`, { action: "approve" });
    check("a gender-targeted ad reaches a member with personalised ads on (default in India)", (await M.get("/api/ads/serve?placement=BANNER")).data?.ad?.id === c2id);
    check("…not someone outside the audience", (await W.get("/api/ads/serve?placement=BANNER")).data?.ad?.id !== c2id);
    const off = await M.post("/api/consents", { kind: "PERSONALISED_ADS", granted: false });
    check("personalised ads can be switched off, recorded as a consent", off.data?.current?.find((x: any) => x.kind === "PERSONALISED_ADS")?.granted === false, off.data?.current);
    check("…then gender isn't used, so that ad isn't shown", (await M.get("/api/ads/serve?placement=BANNER")).data?.ad?.id !== c2id);
    await M.post("/api/consents", { kind: "PERSONALISED_ADS", granted: true });
    check("…and on again", (await M.get("/api/ads/serve?placement=BANNER")).data?.ad?.id === c2id);
    check("hiding an ad works", (await M.post(`/api/ads/${c2id}/hide`)).data?.hidden === true && (await M.get("/api/ads/serve?placement=BANNER")).data?.ad?.id !== c2id);
    check("reports need a listed reason", (await W.post(`/api/ads/${c2id}/report`, { reason: "BORING" })).status === 422);
    const rep = await W.post(`/api/ads/${c2id}/report`, { reason: "MISLEADING", details: "The offer doesn't exist (e2e)" });
    check("a reported ad gets a case number", rep.status === 201 && /^KN-R-\d{4}-/.test(rep.data?.caseNo ?? ""), rep.data);
    check("staff see the report", ((await admin.get("/api/admin/ads")).data?.reports ?? []).some((r: any) => r.caseNo === rep.data?.caseNo));
    check("the advertiser only sees a hide count, not who", (await Adv.get(`/api/ads/campaigns/${c2id}`)).data?.stats?.totals?.hides === 1);

    section("Advertising: advertiser controls, refunds, suspension");
    check("the advertiser can pause", (await Adv.post(`/api/ads/campaigns/${cid}/pause`, { paused: true })).data?.status === "PAUSED");
    check("…and resume", (await Adv.post(`/api/ads/campaigns/${cid}/pause`, { paused: false })).data?.status === "ACTIVE");
    const ed = await Adv.put(`/api/ads/campaigns/${cid}`, camp({ creative: { ...creative, headline: "Now 25% off" } }));
    check("changing a live ad's content sends it back for review", ed.data?.campaign?.status === "DRAFT" && ed.data.backToDraft === true, ed.data);
    const Adv2 = new Client("AdvertiserClientTwo22");
    await Adv2.post("/api/ads/register", { ...base, businessName: `Other Co ${run}`, email: `ads2-${run}@business.test` });
    check("an advertiser can't see or change another business's campaign", (await Adv2.get(`/api/ads/campaigns/${cid}`)).status === 404 && (await Adv2.post(`/api/ads/campaigns/${cid}/pause`, { paused: true })).status === 404);
    check("refunds are limited to unused balance", (await Adv.post("/api/ads/refunds", { amountMinor: 99999999, reason: "Too much" })).data?.code === "amount");
    const rf = await Adv.post("/api/ads/refunds", { amountMinor: 50000, reason: "Pausing advertising for now" });
    check("a refund can be requested", rf.status === 201, rf.data);
    check("moderators can't decide refunds", (await mod.post(`/api/admin/ads/refunds/${rf.data?.id}`, { approve: true, note: "ok" })).status === 403);
    const rd = await finance.post(`/api/admin/ads/refunds/${rf.data?.id}`, { approve: true, note: "Unused balance (e2e)" });
    check("finance approves it and the balance drops", rd.status === 200 && (await Adv.get("/api/ads/account")).data?.advertiser?.balanceMinor === 200000 - 30 - 50000, rd.data);
    const advId = (await Adv.get("/api/ads/account")).data?.advertiser?.id;
    await admin.post(`/api/admin/ads/advertisers/${advId}`, { action: "suspend", why: "e2e" });
    check("suspending an advertiser pauses their running ads", (await admin.get("/api/admin/ads")).data?.campaigns?.find((c: any) => c.id === c2id)?.status === "PAUSED");
    check("…and they can't submit new ones", (await Adv.post(`/api/ads/campaigns/${cid}/submit`)).data?.code === "suspended");
    await admin.post(`/api/admin/ads/advertisers/${advId}`, { action: "restore" });
    check("the homepage banner works for visitors (no personal data used)", (await anon.get("/api/ads/home")).status === 200);
    check("ad prices are set by admins", (await admin.put("/api/admin/config", { config: { "ads.pricing": { cpmMinor: 12000, cpcMinor: 500, cpaMinor: 5000, fixedPerDayMinor: 200000 } } })).status === 200 && (await anon.get("/api/ads/meta")).data?.prices?.cpmMinor === 12000);
    await admin.put("/api/admin/config", { config: { "ads.pricing": { cpmMinor: 10000, cpcMinor: 500, cpaMinor: 5000, fixedPerDayMinor: 200000 } } });
    check("the Advertising Policy is published", (await anon.get("/api/legal/advertising")).status === 200);
    check("the Privacy Policy explains sponsored ads", /Sponsored/.test((await anon.get("/api/legal/privacy")).data?.body ?? ""));
    const job = await fetch(`${BASE}/api/cron/billing`, { method: "POST", headers: { "x-cron-secret": envVal("CRON_SECRET") } }).then((r) => r.json());
    check("scheduled jobs start and finish campaigns on their dates", job?.ads && "started" in job.ads, job?.ads);
    check("ad actions are in the audit log and the chain is intact", (await admin.get("/api/admin/compliance")).data?.auditChain?.ok === true);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("Failed:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
