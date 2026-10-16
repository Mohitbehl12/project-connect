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
  check(`${c.name}: requests selfie verification`, v.status === 200 && v.data.status === "PENDING", v.data);
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

  section("Free months for women (India)");
  const giftA = (await A.get("/api/billing/subscription")).data?.subscription;
  const giftDays = giftA?.endsAt ? Math.round((new Date(giftA.endsAt).getTime() - Date.now()) / 86_400_000) : 0;
  check("woman gets Premium free for 3 months on finishing sign-up", giftA?.status === "REWARD" && giftDays >= 89 && giftDays <= 90, giftA);
  check("the free months need no payment", ((await A.get("/api/billing/subscription")).data?.payments ?? []).length === 0);
  check("free months unlock Premium features", (await A.get("/api/me")).data?.features?.seeWhoLiked === true);

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
