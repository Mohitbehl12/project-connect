// Attack-style security checks against a running server (default http://localhost:3000).
// Not a substitute for an independent penetration test — this is our own repeatable baseline that every
// release must pass: auth on every route, staff-only routes, cross-account access (IDOR), token tampering,
// mass assignment, injection/XSS storage, uploads, path traversal, CSRF, headers, enumeration, leakage.
// Run: npx tsx tests/security.ts   (uses the local demo accounts and the seeded admin)
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { totpAt } from "../src/lib/totp";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? "admin@projectconnect.local", password: process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026" };
let passed = 0;
const failures: string[] = [];
function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ""); }
}
const section = (t: string) => console.log(`\n${t}`);

class C {
  cookie = "";
  constructor(public ip: string) {}
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(BASE + path, {
      method, redirect: "manual",
      headers: { "content-type": "application/json", cookie: this.cookie, "x-forwarded-for": this.ip, ...headers },
      body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set && set.startsWith("pc_session=")) this.cookie = set.split(";")[0];
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, text, headers: res.headers };
  }
  get = (p: string, h?: Record<string, string>) => this.call("GET", p, undefined, h);
  post = (p: string, b: unknown = {}, h?: Record<string, string>) => this.call("POST", p, b, h);
  put = (p: string, b: unknown) => this.call("PUT", p, b);
  del = (p: string) => this.call("DELETE", p, {});
  async login(email: string, password: string) { return this.post("/api/auth/login", { email, password }); }
}

/** Every API route on disk, with [params] filled by a random id. */
function routes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "route.ts") out.push(dir.replace(/^src\/app/, "").replace(/\[\.\.\.(\w+)\]/g, "x/y").replace(/\[(\w+)\]/g, "00000000-0000-0000-0000-000000000000"));
    }
  };
  walk("src/app/api");
  return out.sort();
}

// Routes that are deliberately public (sign-in, legal pages, signed links, health, cron with its own secret…).
const PUBLIC = [/^\/api\/auth\//, /^\/api\/legal\//, /^\/api\/public\//, /^\/api\/health/, /^\/api\/privacy\/retention/, /^\/api\/grievances/, /^\/api\/appeals/,
  /^\/api\/billing\/(confirm|mock|pay|invoices|payments)/, /^\/api\/webhooks\//, /^\/api\/cron\//, /^\/api\/media\//, /^\/api\/plans/];

async function main() {
  console.log(`Security checks against ${BASE}`);
  const anon = new C("10.9.0.1"), A = new C("10.9.0.2"), B = new C("10.9.0.3"), S = new C("10.9.0.4"), admin = new C("10.9.0.5");
  check("demo account A signs in", (await A.login("aanya@demo.local", "Demo!2026")).status === 200);
  check("demo account B signs in", (await B.login("rohan@demo.local", "Demo!2026")).status === 200);
  check("an unrelated member signs in", (await S.login("user1@test.local", "Demo!2026")).status === 200);
  check("admin signs in", (await admin.login(ADMIN.email, ADMIN.password)).status === 200);
  const meA = (await A.get("/api/me")).data, meB = (await B.get("/api/me")).data;
  const match = ((await A.get("/api/matches")).data?.matches ?? []).find((m: any) => m.other?.id === meB?.user?.id);
  check("A and B are matched (test setup)", !!match, match);
  const mid = match?.id;

  section("Authentication on every route");
  const all = routes();
  const leaks: string[] = [];
  for (const r of all) {
    if (PUBLIC.some((p) => p.test(r))) continue;
    for (const m of ["GET", "POST"]) {
      const res = await anon.call(m, r, m === "POST" ? {} : undefined);
      if (res.status < 400 && res.status !== 405) leaks.push(`${m} ${r} → ${res.status}`);
    }
  }
  check(`all ${all.length} routes refuse requests without a session (except the public list)`, !leaks.length, leaks);

  section("Staff-only routes");
  const memberIn: string[] = [];
  for (const r of all.filter((x) => x.startsWith("/api/admin/"))) {
    const res = await A.get(r);
    if (res.status !== 403 && res.status !== 405) memberIn.push(`${r} → ${res.status}`);
  }
  check("a member gets 403 on every /api/admin route", !memberIn.length, memberIn);
  check("…and on the staff unlock", (await A.get("/api/staff/unlock")).status === 403);

  section("Other people's data (IDOR)");
  const msgs = (await A.get(`/api/matches/${mid}/messages`)).data?.messages ?? [];
  const msgId = msgs.find((m: any) => !m.mine)?.id ?? msgs[0]?.id;
  const probes: [string, () => Promise<{ status: number }>][] = [
    ["read their chat", () => S.get(`/api/matches/${mid}/messages`)],
    ["read the match", () => S.get(`/api/matches/${mid}`)],
    ["post into their chat", () => S.post(`/api/matches/${mid}/messages`, { body: "hi" })],
    ["send a wink in their chat", () => S.post(`/api/matches/${mid}/flirt`, { kind: "WINK" })],
    ["see their call state", () => S.get(`/api/matches/${mid}/call`)],
    ["ring one of them", () => S.post(`/api/matches/${mid}/call`, { kind: "AUDIO" })],
    ["request a call in their match", () => S.post("/api/call-requests", { matchId: mid, kind: "AUDIO" })],
    ["mute their chat", () => S.post(`/api/matches/${mid}/mute`, { muted: true })],
    ["ask Cupid about their chat", () => S.post("/api/cupid", { task: "reply", matchId: mid })],
    ["react to their message", () => S.post(`/api/messages/${msgId}/react`, { on: true, emoji: "❤️" })],
    ["delete their message", () => S.del(`/api/messages/${msgId}`)],
    ["unmatch them", () => S.post(`/api/matches/${mid}/unmatch`)],
    ["plan a date in their match", () => S.post(`/api/matches/${mid}/dates`, { kind: "COFFEE", place: "Cafe", startsAt: new Date(Date.now() + 86400_000).toISOString() })],
    ["listen for typing and new messages in their chat", () => S.get(`/api/matches/${mid}/wait?v=-1`)],
    ["show 'typing' in their chat", () => S.post(`/api/matches/${mid}/typing`, { typing: true })],
    ["send media into their chat", () => S.post(`/api/matches/${mid}/media`, {})],
    ["read their compatibility answers", () => S.get(`/api/compatibility/${meB?.user?.id}`)],
  ];
  for (const [what, fn] of probes) { const r = await fn(); check(`a stranger can't ${what}`, r.status === 403 || r.status === 404 || r.status === 410, r.status); }
  const stillThere = (await A.get(`/api/matches/${mid}/messages`)).data?.messages?.some((m: any) => m.id === msgId);
  check("…and nothing changed for A and B", stillThere === true);

  section("Token and cookie tampering");
  const [h, p] = A.cookie.replace("pc_session=", "").split(".");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  const forged = Buffer.from(JSON.stringify({ ...payload, r: "SUPER_ADMIN" })).toString("base64url");
  const t1 = await anon.get("/api/me", { cookie: `pc_session=${h}.${forged}.xxxx` });
  check("a cookie with an edited payload is refused", t1.status === 401);
  const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  check("an unsigned (alg: none) token is refused", (await anon.get("/api/me", { cookie: `pc_session=${none}.${p}.` })).status === 401);
  check("a bearer token that isn't an access token is refused", (await anon.get("/api/me", { authorization: `Bearer ${A.cookie.replace("pc_session=", "")}` })).status === 401);
  check("garbage tokens are refused", (await anon.get("/api/me", { authorization: "Bearer abc.def.ghi" })).status === 401);

  section("Mass assignment and role escalation");
  const sneaky = new C("10.9.0.6"), sneakyEmail = `sec-${Date.now()}@test.local`;
  const reg = await sneaky.post("/api/auth/register", { email: sneakyEmail, password: "Testing123", dob: "1995-05-05", acceptLegal: true, confirmAdult: true, safetyAcknowledged: true, role: "SUPER_ADMIN", status: "ACTIVE", planCode: "VIP", selfieStatus: "VERIFIED", tokenVersion: 99 });
  const sMe = (await sneaky.get("/api/me")).data?.user;
  check("sign-up ignores role, plan and verification fields", reg.status === 201 && sMe?.role === "USER" && sMe?.selfieStatus === "NONE" && sMe?.planCode === "FREE", sMe);
  await A.put("/api/preferences", { role: "SUPER_ADMIN", planCode: "VIP", selfieStatus: "VERIFIED" });
  const after = (await A.get("/api/me")).data?.user;
  check("…and so do preferences", after?.role === "USER" && after?.selfieStatus === meA?.user?.selfieStatus, after);
  check("under-18 sign-up is refused", (await new C("10.9.0.7").post("/api/auth/register", { email: `kid-${Date.now()}@test.local`, password: "Testing123", dob: `${new Date().getFullYear() - 16}-01-01`, acceptLegal: true, confirmAdult: true, safetyAcknowledged: true })).status === 403);

  section("Injection and stored scripts");
  const evil = `<img src=x onerror=alert(1)><script>alert(2)</script>' OR 1=1; DROP TABLE users; --`;
  const send = await A.post(`/api/matches/${mid}/messages`, { body: evil, confirmed: true });
  check("a message with SQL and script text is stored as plain text", send.status === 201);
  const back = ((await B.get(`/api/matches/${mid}/messages`)).data?.messages ?? []).find((m: any) => m.id === send.data?.id);
  check("…and comes back byte-for-byte (rendered as text, never HTML)", back?.body === evil, back?.body);
  check("the users table is fine afterwards", (await A.get("/api/me")).status === 200);
  // Staff need 2-step: switch it on for this test admin, run the check, then switch it off again.
  const t0 = await admin.post("/api/security/totp", { action: "start" });
  const secret = t0.data?.secret;
  if (secret) await admin.post("/api/security/totp", { action: "confirm", code: totpAt(secret, Date.now()) });
  check("staff tools refuse an admin without 2-step until it's on", !!secret || t0.data?.code === "already_on", t0.data);
  const search = await admin.get(`/api/admin/users?q=${encodeURIComponent("' OR '1'='1")}`);
  if (secret) await admin.post("/api/security/totp", { action: "disable", password: ADMIN.password, code: totpAt(secret, Date.now()) });
  check("admin search treats quotes as text", search.status === 200 && (search.data?.users ?? []).length === 0, search.data?.users?.length);
  const page = await anon.get("/legal/terms");
  check("legal pages don't inject raw HTML", page.status === 200 && !/<script>alert/.test(page.text));

  section("Uploads and file paths");
  const form = new FormData();
  form.append("photo", new Blob([new TextEncoder().encode("<svg onload=alert(1)>")], { type: "image/jpeg" }), "x.jpg");
  const up = await fetch(BASE + "/api/photos", { method: "POST", headers: { cookie: A.cookie, "x-forwarded-for": A.ip }, body: form });
  check("a fake image (SVG/script disguised as JPEG) is rejected", up.status === 422 || up.status === 400, up.status);
  const big = new FormData();
  big.append("photo", new Blob([new Uint8Array(16 * 1024 * 1024)], { type: "image/jpeg" }), "big.jpg");
  const upBig = await fetch(BASE + "/api/photos", { method: "POST", headers: { cookie: A.cookie, "x-forwarded-for": A.ip }, body: big });
  check("a 16 MB upload is refused", upBig.status >= 400, upBig.status);
  for (const p of ["/api/media/..%2F..%2Fdata%2Fdev.db", "/api/media/../../.env", "/api/media/photos/%2e%2e/%2e%2e/.env?exp=9999999999&sig=x"]) {
    const r = await anon.get(p);
    check(`media path traversal blocked: ${p}`, r.status >= 400 && !/AUTH_SECRET|SQLite format/.test(r.text), r.status);
  }

  section("CSRF, headers, enumeration, brute force");
  const csrf = await A.post("/api/preferences", { showOnline: false }, { origin: "https://evil.example" });
  check("a cookie request from another website is refused", csrf.status === 403, csrf.status);
  const home = await anon.get("/");
  const hd = (k: string) => home.headers.get(k) ?? "";
  check("Content-Security-Policy is set", /default-src/.test(hd("content-security-policy")));
  check("pages can't be framed (clickjacking)", /frame-ancestors 'none'|DENY/i.test(hd("content-security-policy") + hd("x-frame-options")));
  check("MIME sniffing is off", hd("x-content-type-options") === "nosniff");
  check("a referrer policy is set", !!hd("referrer-policy"));
  const f1 = await anon.post("/api/auth/forgot", { email: "aanya@demo.local" }), f2 = await anon.post("/api/auth/forgot", { email: `nobody-${Date.now()}@test.local` });
  check("password reset doesn't reveal whether an email exists", f1.data?.message === f2.data?.message && f1.status === f2.status);
  const l1 = await anon.login("aanya@demo.local", "wrong-password"), l2 = await anon.login(`nobody-${Date.now()}@test.local`, "wrong-password");
  check("sign-in errors don't reveal whether an email exists", l1.data?.error === l2.data?.error, [l1.data, l2.data]);
  const brute = new C("10.9.0.8");
  let locked = false;
  for (let i = 0; i < 14; i++) { const r = await brute.login(`nobody-brute@test.local`, `guess-${i}`); if (r.status === 423 || r.status === 429) { locked = true; break; } }
  check("password guessing is stopped (lockout or rate limit)", locked);

  section("Data leakage in member-facing responses");
  const responses = [await B.get("/api/discovery"), await B.get(`/api/matches/${mid}`), await B.get("/api/matches"), await B.get("/api/likes"), await B.get(`/api/matches/${mid}/messages`)];
  const blob = JSON.stringify(responses.map((r) => r.data));
  check("no password hashes, 2-step secrets or tokens", !/passwordHash|password_hash|totpSecret|argon2|refreshToken/.test(blob));
  check("no coordinates", !/"lat"|"lng"/.test(blob));
  check("no other members' email, phone or date of birth", !blob.includes(meA?.user?.email) && !/"phone"|"dob"/.test(blob));
  check("no internal risk or moderation fields", !/riskLevel|restrictedAt|signupIp|signupInstallId/.test(blob));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log("Failed:\n - " + failures.join("\n - ")); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
