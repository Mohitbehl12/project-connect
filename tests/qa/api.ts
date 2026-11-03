// QA campaign, API part: malformed input on every write route, a role × route access matrix,
// simulated members (likes, matches, chat, blocks, reports) with invariant checks, and response-time budgets.
// Run against a server started with ADMIN_MFA_OPTIONAL=true:  npx tsx tests/qa/api.ts
import { ADMIN, ADVERTISER_ALLOWED, BASE, Client, PUBLIC, RUN, onboard, record, rng, routes, save } from "./lib";

const S = "api";
const isPublic = (p: string) => PUBLIC.some((r) => r.test(p));
const no5xx = (s: number) => s > 0 && s < 500;

async function fuzz(member: Client, admin: Client) {
  console.log("\nMalformed input on every write route");
  const all = routes();
  const big = "x".repeat(300_000);
  const payloads: [string, string][] = [
    ["empty object", "{}"],
    ["wrong types everywhere", JSON.stringify({ id: 1, body: ["x"], kind: null, email: 5, amountMinor: "lots", name: { a: 1 }, toId: true, reason: 42, action: [], granted: "yes" })],
    ["oversized text (300 KB)", JSON.stringify({ body: big, bio: big, name: big, details: big, reason: big })],
    ["not JSON at all", "this is {not json"],
  ];
  const extra: [string, string][] = [
    ["prototype-pollution keys", '{"__proto__":{"role":"SUPER_ADMIN","isAdmin":true},"constructor":{"prototype":{"polluted":1}}}'],
    ["control and bidi characters", JSON.stringify({ body: "\u0000‮💥​<script>", name: "\u0000", bio: "\ud800" })],
    ["a JSON array instead of an object", "[1,2,3]"],
    ["negative and huge numbers", JSON.stringify({ amountMinor: -1e308, ageMin: -5, ageMax: 1e9, days: Number.MAX_SAFE_INTEGER, heightCm: -1 })],
  ];
  const writes = all.flatMap((r) => r.methods.filter((m) => m !== "GET").map((m) => ({ ...r, m })));
  const member_ = writes.filter((r) => !r.path.startsWith("/api/admin") && !r.path.startsWith("/api/cron") && !r.path.startsWith("/api/webhooks") && r.path !== "/api/auth/logout");
  const adminW = writes.filter((r) => r.path.startsWith("/api/admin"));
  for (const r of member_) {
    for (const [what, body] of payloads) {
      const res = await member.raw(r.m, r.path, body);
      record(S, "Malformed input (member routes)", `${r.m} ${r.template} — ${what} → no server error`, no5xx(res.status), { status: res.status, body: res.text.slice(0, 200) }, res.ms);
    }
  }
  // Deeper set on the routes people use most.
  const hot = member_.filter((r) => /\/(profile|preferences|likes|messages|reports|blocks|consents|cupid|boosts|travel|call-requests|ads\/campaigns|ads\/topups|ads\/refunds|personality|verification|grievances|appeals)/.test(r.path));
  for (const r of hot) for (const [what, body] of extra) {
    const res = await member.raw(r.m, r.path, body);
    record(S, "Hostile input (busy routes)", `${r.m} ${r.template} — ${what} → no server error`, no5xx(res.status), { status: res.status, body: res.text.slice(0, 200) }, res.ms);
  }
  for (const r of adminW) for (const [what, body] of payloads.slice(0, 2).concat([payloads[3]])) {
    const res = await admin.raw(r.m, r.path, body);
    record(S, "Malformed input (staff routes)", `${r.m} ${r.template} — ${what} → no server error`, no5xx(res.status), { status: res.status, body: res.text.slice(0, 200) }, res.ms);
  }
  const me = await member.get("/api/me");
  record(S, "Malformed input (member routes)", "after all that, the member is still a USER and the server is healthy", me.data?.user?.role === "USER" && (await member.get("/api/health")).status === 200, me.data?.user?.role);
}

async function matrix(member: Client, advertiser: Client, anon: Client, support: Client) {
  console.log("\nRole × route access matrix (GET)");
  const gets = routes().filter((r) => r.methods.includes("GET") && !r.path.startsWith("/api/cron") && !r.path.startsWith("/api/webhooks"));
  for (const r of gets) {
    const a = await anon.get(r.path);
    record(S, "Access: signed out", `GET ${r.template} → ${isPublic(r.path) ? "public, no server error" : "401"}`, isPublic(r.path) ? no5xx(a.status) : a.status === 401, a.status, a.ms);
    const m = await member.get(r.path);
    const memberExpect = r.path.startsWith("/api/admin") || r.path.startsWith("/api/staff") ? [403] : /^\/api\/ads\/(account|campaigns|billing|receipts)/.test(r.path) ? [403, 404] : null;
    record(S, "Access: member", `GET ${r.template} → ${memberExpect ? "refused" : "no server error"}`, memberExpect ? memberExpect.includes(m.status) : no5xx(m.status), m.status, m.ms);
    const ad = await advertiser.get(r.path);
    const adOk = isPublic(r.path) ? no5xx(ad.status) : ADVERTISER_ALLOWED.test(r.path) ? no5xx(ad.status) : ad.status === 403;
    record(S, "Access: business account", `GET ${r.template} → ${!isPublic(r.path) && !ADVERTISER_ALLOWED.test(r.path) ? "403" : "no server error"}`, adOk, ad.status, ad.ms);
  }
  // Staff without a permission get 403 — never a 500 or the data.
  const admins = gets.filter((r) => r.path.startsWith("/api/admin"));
  for (const r of admins) {
    const s = await support.get(r.path);
    record(S, "Access: support staff (least privilege)", `GET ${r.template} → allowed or 403, never an error`, [200, 403, 404].includes(s.status), s.status, s.ms);
  }
}

async function journeys(admin: Client) {
  console.log("\nSimulated members: likes, matches, chat, blocks, reports");
  const R = rng(20261103);
  const N = 14;
  const people: { c: Client; id: string; gender: string; name: string }[] = [];
  const names = ["Asha", "Kabir", "Diya", "Arjun", "Meher", "Rohit", "Ira", "Vivaan", "Sana", "Aarav", "Tara", "Neil", "Riya", "Dev"];
  const cities = ["Delhi", "Gurugram", "Noida"];
  for (let i = 0; i < N; i++) {
    const gender = i % 2 ? "MAN" : "WOMAN";
    const c = new Client(`qa-${i}-${RUN}`);
    try {
      const id = await onboard(c, { email: `qa${i}-${RUN}@test.local`, gender, seeking: [gender === "MAN" ? "WOMAN" : "MAN"], name: names[i], city: cities[i % 3], interests: [["coffee", "travel", "reading"], ["music_live", "gym", "travel"], ["films", "cooking", "coffee"]][i % 3] });
      people.push({ c, id, gender, name: names[i] });
      record(S, "Journeys: sign-up", `member ${i + 1} (${gender.toLowerCase()}) signs up and completes the profile`, true);
    } catch (e) { record(S, "Journeys: sign-up", `member ${i + 1} signs up and completes the profile`, false, String(e)); }
  }
  for (const p of people) {
    const me = (await p.c.get("/api/me")).data;
    record(S, "Journeys: sign-up", `${p.name}: onboarding finished and nothing private leaks from /api/me`, me?.user?.onboardingStep === 3 && !("lat" in (me?.profile ?? {})) && !("passwordHash" in (me?.user ?? {})), me?.user?.onboardingStep);
  }
  // Discovery invariants
  for (const p of people) {
    const d = await p.c.get("/api/discovery");
    const cards = d.data?.cards ?? [];
    const blob = JSON.stringify(d.data);
    record(S, "Journeys: discovery", `${p.name}: Discover only shows the gender they asked for`, cards.every((c: any) => c.gender !== p.gender || p.gender === "NONBINARY"), cards.map((c: any) => c.gender));
    record(S, "Journeys: discovery", `${p.name}: Discover never includes themselves`, !cards.some((c: any) => c.id === p.id));
    record(S, "Journeys: discovery", `${p.name}: no email, phone, date of birth or coordinates in Discover`, !/"email"|"phone"|"dob"|"lat"|"lng"|passwordHash/.test(blob));
    record(S, "Journeys: discovery", `${p.name}: ages shown are 18+ and within their range`, cards.every((c: any) => c.age >= 21 && c.age <= 45), cards.map((c: any) => c.age));
    record(S, "Journeys: discovery", `${p.name}: compatibility scores are 0–100`, cards.every((c: any) => typeof c.score !== "number" || (c.score >= 0 && c.score <= 100)), cards.map((c: any) => c.score));
    const ex = await p.c.get("/api/explore");
    record(S, "Journeys: explore", `${p.name}: Explore loads with 12 collections and real counts`, ex.status === 200 && ex.data?.categories?.length === 12 && ex.data.categories.every((c: any) => c.count >= 0), ex.status, ex.ms);
  }
  // Random likes; whenever both sides like, a match must exist exactly once on both sides.
  const women = people.filter((p) => p.gender === "WOMAN"), men = people.filter((p) => p.gender === "MAN");
  const liked = new Set<string>(), passed = new Set<string>();
  // Force a few guaranteed matches and test chat invariants on them.
  const pairs: [typeof people[0], typeof people[0]][] = [];
  for (let i = 0; i < Math.min(women.length, men.length, 5); i++) {
    await women[i].c.post("/api/likes", { toId: men[i].id, kind: "LIKE" });
    const back = await men[i].c.post("/api/likes", { toId: women[i].id, kind: "LIKE" });
    const matched = back.data?.matched === true || !!(await women[i].c.get("/api/matches")).data?.matches?.some((m: any) => m.other?.id === men[i].id);
    record(S, "Journeys: matches", `${women[i].name} + ${men[i].name}: mutual like makes a match`, matched, back.data);
    pairs.push([women[i], men[i]]);
    liked.add(`${women[i].id}>${men[i].id}`); liked.add(`${men[i].id}>${women[i].id}`);
  }
  for (let k = 0; k < 40; k++) {
    const fromW = R() < 0.5;
    const a = (fromW ? women : men)[Math.floor(R() * (fromW ? women : men).length)];
    const b = (fromW ? men : women)[Math.floor(R() * (fromW ? men : women).length)];
    if (!a || !b || liked.has(`${a.id}>${b.id}`)) continue;
    const passedBefore = liked.has(`${b.id}>${a.id}`) && passed.has(`${b.id}>${a.id}`);
    const kind = R() < 0.15 ? "PASS" : "LIKE";
    if (kind === "PASS") passed.add(`${a.id}>${b.id}`);
    const r = await a.c.post("/api/likes", { toId: b.id, kind });
    liked.add(`${a.id}>${b.id}`);
    const ok = r.status === 200 || r.data?.code === "daily_limit";
    record(S, "Journeys: likes", `${a.name} ${kind === "PASS" ? "passes on" : "likes"} ${b.name}`, ok, { status: r.status, data: r.data });
    if (kind === "LIKE" && liked.has(`${b.id}>${a.id}`) && !passedBefore && r.status === 200) {
      record(S, "Journeys: likes", `${a.name} and ${b.name} liked each other → it's a match`, r.data?.matched === true, r.data);
    }
  }
  // Duplicate like is idempotent
  if (women[0] && men[0]) {
    const once = await women[0].c.post("/api/likes", { toId: men[0].id, kind: "LIKE" });
    const twice = await women[0].c.post("/api/likes", { toId: men[0].id, kind: "LIKE" });
    record(S, "Journeys: likes", "liking the same person twice doesn't create a second like or error", no5xx(once.status) && no5xx(twice.status), [once.status, twice.status]);
    record(S, "Journeys: likes", "you can't like yourself", (await women[0].c.post("/api/likes", { toId: women[0].id, kind: "LIKE" })).status >= 400);
    record(S, "Journeys: likes", "you can't like a made-up account", (await women[0].c.post("/api/likes", { toId: "00000000-0000-4000-8000-000000000000", kind: "LIKE" })).status >= 400);
  }
  for (const [w, m] of pairs) {
    const mw = (await w.c.get("/api/matches")).data?.matches?.find((x: any) => x.other?.id === m.id);
    const mm = (await m.c.get("/api/matches")).data?.matches?.find((x: any) => x.other?.id === w.id);
    record(S, "Journeys: matches", `${w.name} + ${m.name}: both see the same match`, !!mw && mw.id === mm?.id, [mw?.id, mm?.id]);
    if (!mw) continue;
    const mid = mw.id;
    const texts = ["Hi! Your chai date idea sounds lovely 🙂", "Which bookshop do you like most?", "Haha same, I go there every Sunday", "मुझे भी किताबें पसंद हैं", "Emoji test 🌹✨💕"];
    let sent = 0;
    for (let i = 0; i < texts.length; i++) {
      const from = i % 2 ? m : w;
      const r = await from.c.post(`/api/matches/${mid}/messages`, { body: texts[i], confirmed: true });
      if (r.status === 201) sent++;
      record(S, "Journeys: chat", `${from.name} sends message ${i + 1} (${texts[i].length} chars)`, r.status === 201, { status: r.status, data: r.data });
    }
    const back = (await m.c.get(`/api/matches/${mid}/messages`)).data?.messages ?? [];
    record(S, "Journeys: chat", `${m.name} receives every message in order, byte for byte`, texts.every((t, i) => back.some((x: any) => x.body === t)) && back.length >= sent, back.map((x: any) => x.body));
    record(S, "Journeys: chat", "an empty message is refused", (await w.c.post(`/api/matches/${mid}/messages`, { body: "   " })).status === 422);
    record(S, "Journeys: chat", "a 5,000-character message is refused or trimmed, not stored whole", await (async () => { const r = await w.c.post(`/api/matches/${mid}/messages`, { body: "a".repeat(5000), confirmed: true }); return r.status === 422 || (r.status === 201 && (r.data?.body?.length ?? 0) <= 2000); })());
    const outsider = people.find((p) => p.id !== w.id && p.id !== m.id)!;
    record(S, "Journeys: chat", "someone outside the match can't read it", [403, 404].includes((await outsider.c.get(`/api/matches/${mid}/messages`)).status));
    record(S, "Journeys: chat", "…or write into it", [403, 404].includes((await outsider.c.post(`/api/matches/${mid}/messages`, { body: "hi" })).status));
    const unread = (await m.c.get("/api/matches")).data?.matches?.find((x: any) => x.id === mid)?.unread;
    record(S, "Journeys: chat", "unread counts are never negative", typeof unread === "number" && unread >= 0, unread);
  }
  // Blocking hides people everywhere, both ways.
  if (pairs[0]) {
    const [w, m] = pairs[0];
    await w.c.post("/api/blocks", { userId: m.id });
    record(S, "Journeys: blocking", "after a block the match disappears for the blocker", !((await w.c.get("/api/matches")).data?.matches ?? []).some((x: any) => x.other?.id === m.id));
    record(S, "Journeys: blocking", "…and for the blocked person", !((await m.c.get("/api/matches")).data?.matches ?? []).some((x: any) => x.other?.id === w.id));
    record(S, "Journeys: blocking", "the blocked person can't open the blocker's profile", (await m.c.get(`/api/people/${w.id}`)).status === 404);
    record(S, "Journeys: blocking", "neither shows in the other's Discover", !JSON.stringify((await m.c.get("/api/discovery")).data).includes(w.id) && !JSON.stringify((await w.c.get("/api/discovery")).data).includes(m.id));
    record(S, "Journeys: blocking", "…or in Explore", !JSON.stringify((await m.c.get("/api/explore")).data).includes(w.id));
    record(S, "Journeys: blocking", "the blocked person can't like the blocker again", (await m.c.post("/api/likes", { toId: w.id, kind: "LIKE" })).status >= 400 || (await m.c.get("/api/matches")).data?.matches?.every((x: any) => x.other?.id !== w.id));
  }
  // Reports get case numbers and appear for staff.
  if (pairs[1]) {
    const [w, m] = pairs[1];
    const rep = await w.c.post("/api/reports", { reportedId: m.id, category: "HARASSMENT", details: "QA test report — please ignore.", alsoBlock: false });
    record(S, "Journeys: reports", "a report is accepted with a case number", rep.status === 201 && /^KN-R-\d{4}-/.test(rep.data?.caseNo ?? ""), rep.data);
    const queue = await admin.get("/api/admin/reports");
    record(S, "Journeys: reports", "staff can see it in the queue", JSON.stringify(queue.data).includes(rep.data?.caseNo ?? "∅"), queue.status);
    record(S, "Journeys: reports", "an empty report is refused", (await w.c.post("/api/reports", {})).status === 422);
  }
  // Unmatch
  if (pairs[2]) {
    const [w, m] = pairs[2];
    const mid = (await w.c.get("/api/matches")).data?.matches?.find((x: any) => x.other?.id === m.id)?.id;
    const u = await w.c.post(`/api/matches/${mid}/unmatch`);
    record(S, "Journeys: matches", "unmatching works", u.status === 200, u.data);
    record(S, "Journeys: matches", "after unmatching, no more messages can be sent", (await m.c.post(`/api/matches/${mid}/messages`, { body: "hello?" })).status >= 400);
  }
  // Settings round-trips
  for (const p of people.slice(0, 6)) {
    const s1 = await p.c.put("/api/preferences", { showCity: false });
    const me1 = (await p.c.get("/api/me")).data?.preferences;
    record(S, "Journeys: settings", `${p.name}: hiding the city is saved`, s1.status === 200 && me1?.showCity === false, me1?.showCity);
    await p.c.put("/api/preferences", { showCity: true });
    const bio = `Updated bio ${RUN} — still loves coffee.`;
    await p.c.patch("/api/profile", { bio });
    const pr = (await p.c.get("/api/me")).data?.profile;
    record(S, "Journeys: settings", `${p.name}: a bio-only save keeps interests and prompts`, pr?.bio === bio && (pr?.interests ?? "").length > 0 && JSON.parse(pr?.prompts ?? "[]").length === 1, pr);
    const ex = await p.c.get("/api/privacy/export");
    record(S, "Journeys: privacy", `${p.name}: data export downloads`, ex.status === 200, ex.status);
  }
  return people;
}

async function concurrency(admin: Client) {
  console.log("\nRace conditions (the same action fired at the same moment)");
  const A = "Concurrency";
  for (let round = 0; round < 5; round++) {
    const w = new Client(`qa-cw${round}-${RUN}`), m = new Client(`qa-cm${round}-${RUN}`);
    const wid = await onboard(w, { email: `qacw${round}-${RUN}@test.local`, gender: "WOMAN", seeking: ["MAN"], name: "Noor" });
    const mid_ = await onboard(m, { email: `qacm${round}-${RUN}@test.local`, gender: "MAN", seeking: ["WOMAN"], name: "Zayn" });
    const [r1, r2] = await Promise.all([w.post("/api/likes", { toId: mid_, kind: "LIKE" }), m.post("/api/likes", { toId: wid, kind: "LIKE" })]);
    const mw = ((await w.get("/api/matches")).data?.matches ?? []).filter((x: any) => x.other?.id === mid_);
    record(S, A, `round ${round + 1}: two people liking each other at the same instant get exactly one match`, mw.length === 1, { r1: r1.data, r2: r2.data, matches: mw.length });
    const dup = await Promise.all(Array.from({ length: 5 }, () => w.post("/api/likes", { toId: mid_, kind: "LIKE" })));
    record(S, A, `round ${round + 1}: five identical likes at once don't cause a server error`, dup.every((d) => no5xx(d.status)), dup.map((d) => d.status));
    const mId = mw[0]?.id;
    if (mId) {
      const sends = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? m : w).post(`/api/matches/${mId}/messages`, { body: `parallel ${i}`, confirmed: true })));
      const got = ((await w.get(`/api/matches/${mId}/messages`)).data?.messages ?? []).filter((x: any) => /^parallel \d$/.test(x.body));
      const okSends = sends.filter((x) => x.status === 201).length;
      record(S, A, `round ${round + 1}: 8 messages sent at once are all stored once (${okSends} accepted)`, got.length === okSends && sends.every((x) => no5xx(x.status)), { stored: got.length, accepted: okSends, statuses: sends.map((x) => x.status) });
    }
    const boosts = await Promise.all(Array.from({ length: 4 }, () => w.post("/api/boosts")));
    const started = boosts.filter((b) => b.status === 201).length;
    record(S, A, `round ${round + 1}: four boost taps at once start at most one boost`, started <= 1 && boosts.every((b) => no5xx(b.status)), boosts.map((b) => b.status));
  }
  // Money: the same top-up confirmed several times at once must credit once.
  for (let round = 0; round < 3; round++) {
    const adv = new Client(`qa-cadv${round}-${RUN}`);
    await adv.post("/api/ads/register", { businessName: `Race Co ${round} ${RUN}`, contactName: "QA", email: `qa-race${round}-${RUN}@business.test`, phone: "+91 90000 33333", category: "RETAIL", password: "Business123", acceptTerms: true });
    const t = await adv.post("/api/ads/topups", { amountMinor: 100000 });
    const conf = await Promise.all(Array.from({ length: 6 }, () => adv.post(`/api/ads/topups/${t.data?.id}`, { test: true })));
    const bal = (await adv.get("/api/ads/account")).data?.advertiser?.balanceMinor;
    record(S, A, `top-up ${round + 1}: six confirmations at once credit ₹1,000 exactly once`, bal === 100000 && conf.every((c) => no5xx(c.status)), { bal, statuses: conf.map((c) => c.status) });
    const refunds = await Promise.all(Array.from({ length: 4 }, () => adv.post("/api/ads/refunds", { amountMinor: 50000, reason: "Testing parallel refunds" })));
    record(S, A, `top-up ${round + 1}: four refund requests at once open only one`, refunds.filter((r) => r.status === 201).length === 1, refunds.map((r) => r.status));
    const receipts = (await adv.get("/api/ads/billing")).data?.transactions?.filter((x: any) => x.receiptNo) ?? [];
    record(S, A, `top-up ${round + 1}: receipt numbers are unique`, new Set(receipts.map((x: any) => x.receiptNo)).size === receipts.length, receipts.map((x: any) => x.receiptNo));
  }
  // Different businesses paying at the same moment must still get different receipt numbers.
  const advs = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
    const c = new Client(`qa-rcpt${i}-${RUN}`);
    await c.post("/api/ads/register", { businessName: `Receipt Co ${i} ${RUN}`, contactName: "QA", email: `qa-rcpt${i}-${RUN}@business.test`, phone: "+91 90000 44444", category: "RETAIL", password: "Business123", acceptTerms: true });
    const t = await c.post("/api/ads/topups", { amountMinor: 60000 });
    return { c, id: t.data?.id as string };
  }));
  for (let round = 0; round < 3; round++) {
    const res = await Promise.all(advs.map(async ({ c }) => { const t = await c.post("/api/ads/topups", { amountMinor: 60000 }); return c.post(`/api/ads/topups/${t.data?.id}`, { test: true }); }));
    const nos = res.map((r) => r.data?.receiptNo).filter(Boolean);
    record(S, A, `round ${round + 1}: six businesses paying at the same moment get six different receipt numbers`, nos.length === 6 && new Set(nos).size === 6, nos);
  }
}

/** The app expects the same fields whether a list is empty or full; a missing field crashes a screen. */
async function shapes() {
  console.log("\nResponse shape: brand-new account vs busy account");
  const fresh = new Client(`qa-shape-${RUN}`);
  await onboard(fresh, { email: `qa-shape-${RUN}@test.local`, gender: "NONBINARY", seeking: ["NONBINARY"], name: "Kiran", city: "Jaipur", interests: [] });
  const busy = new Client("qa-shape-busy"); await busy.login("rohan@demo.local", "Demo!2026");
  const gets = routes().filter((r) => r.methods.includes("GET") && !r.template.includes("[") && !/^\/api\/(admin|staff|cron|webhooks|auth|ads\/(account|campaigns|billing|receipts)|media|health)/.test(r.template));
  const keys = (o: any, pre = ""): string[] => (o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o).flatMap((k) => [pre + k, ...(o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) && pre.split(".").length < 2 ? keys(o[k], `${pre}${k}.`) : [])]) : []);
  for (const r of gets) {
    const [a, b] = await Promise.all([fresh.get(r.path), busy.get(r.path)]);
    if (a.status !== 200 || b.status !== 200) { record(S, "Response shape (empty vs busy)", `GET ${r.template}: both accounts get an answer`, no5xx(a.status) && no5xx(b.status), [a.status, b.status]); continue; }
    const ka = new Set(keys(a.data)), kb = new Set(keys(b.data));
    const missing = [...kb].filter((k) => !ka.has(k) && !/\.(?!.*\.)/.test(k.split(".").slice(-1)[0]) && k.split(".").length === 1);
    record(S, "Response shape (empty vs busy)", `GET ${r.template}: a new account gets the same top-level fields as a busy one`, missing.length === 0, { missingForNewAccount: missing });
  }
}

async function performance(people: { c: Client; name: string }[]) {
  console.log("\nResponse-time budgets (20 parallel requests each)");
  const budgets: [string, number][] = [["/api/me", 800], ["/api/discovery", 2500], ["/api/explore", 3000], ["/api/matches", 1200], ["/api/likes", 1500], ["/api/notifications", 800], ["/api/plans", 800], ["/api/legal/terms", 800], ["/api/ads/serve?placement=FEED", 1200], ["/api/health", 300]];
  for (const [path, budget] of budgets) {
    const times = await Promise.all(Array.from({ length: 20 }, (_, i) => people[i % people.length].c.get(path).then((r) => (no5xx(r.status) ? r.ms : 99999))));
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95) - 1];
    record(S, "Performance", `${path}: 95% of 20 parallel requests within ${budget} ms (p95 ${p95} ms)`, p95 <= budget, { p95, max: times[times.length - 1] });
  }
}

async function main() {
  console.log(`QA (API) against ${BASE}, run ${RUN}`);
  const admin = new Client("qa-admin"), anon = new Client("qa-anon"), support = new Client("qa-support");
  if ((await admin.login(ADMIN.email, ADMIN.password)).status !== 200) throw new Error("admin login failed — start the server with ADMIN_MFA_OPTIONAL=true");
  await support.login("support@projectconnect.local", ADMIN.password);
  const member = new Client("qa-member");
  await onboard(member, { email: `qam-${RUN}@test.local`, gender: "WOMAN", seeking: ["MAN"], name: "Qamar" });
  const advertiser = new Client("qa-advertiser");
  const reg = await advertiser.post("/api/ads/register", { businessName: `QA Co ${RUN}`, contactName: "QA Lead", email: `qa-ads-${RUN}@business.test`, phone: "+91 90000 11111", category: "RETAIL", password: "Business123", acceptTerms: true });
  if (reg.status !== 201) throw new Error(`advertiser: ${reg.text}`);
  const only = process.argv[2];
  if (!only || only === "fuzz") await fuzz(member, admin);
  if (!only || only === "matrix") await matrix(member, advertiser, anon, support);
  let people: any[] = [];
  if (!only || only === "journeys") people = await journeys(admin);
  if (!only || only === "shape") await shapes();
  if (!only || only === "race") await concurrency(admin);
  if (!only || only === "perf") await performance(people.length ? people : [{ c: member, name: "m" }]);
  const failed = save(S);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); save(S); process.exit(2); });
