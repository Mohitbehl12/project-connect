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
    check("card shows a compatibility score", cardB.score >= 40 && cardB.score <= 99, cardB.score);
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
