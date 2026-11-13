// Load test. No dependencies: plain fetch, a fixed number of virtual members, percentile latencies.
//
//   1. Seed a throwaway database with many sample people (never a real one):
//        DATABASE_URL=file:./data/load.db npx tsx scripts/migrate.ts
//        DATABASE_URL=file:./data/load.db SEED_SAMPLE_COUNT=20000 npm run db:seed
//   2. Start a production build against it:
//        DATABASE_URL=file:./data/load.db npx next build && DATABASE_URL=file:./data/load.db npx next start -p 3000
//   3. Run:  npx tsx tests/load.ts
//
// Settings (environment variables):
//   LOAD_BASE      server to test                     default http://127.0.0.1:3000
//   LOAD_USERS     virtual members signed in at once  default 100
//   LOAD_SECONDS   how long the steady phase lasts    default 60
//   LOAD_THINK_MS  average pause between a member's requests  default 5000
//                  (someone swiping fetches a new deck now and then, not on every card)
//   LOAD_P95_MS    fail if any endpoint's p95 exceeds default 1500
//   LOAD_ERR_PCT   fail if errors exceed this percent default 1
//
// It signs in as the seeded sample people (user1@test.local … password Demo!2026), so it only works
// against a database seeded as above. It refuses to run against anything that isn't localhost unless
// LOAD_ALLOW_REMOTE=true, because it sends real traffic and writes chat messages.
//
// What the numbers mean: this measures the server on the machine it runs on. Results from a laptop or a
// CI runner say whether the code scales sensibly, not what the production server will do.

export {}; // a module, so its names don't collide with the other test scripts

const BASE = process.env.LOAD_BASE ?? "http://127.0.0.1:3000";
const USERS = Number(process.env.LOAD_USERS ?? 100);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 60);
const THINK = Number(process.env.LOAD_THINK_MS ?? 5000);
const P95_LIMIT = Number(process.env.LOAD_P95_MS ?? 1500);
const ERR_LIMIT = Number(process.env.LOAD_ERR_PCT ?? 1);

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE) && process.env.LOAD_ALLOW_REMOTE !== "true") {
  console.error(`Refusing to load-test ${BASE}. Set LOAD_ALLOW_REMOTE=true only for a staging server you own.`);
  process.exit(2);
}

// Deterministic choices, so two runs exercise the same mix.
let seed = 20261113;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Stat = { ms: number[]; errors: number; statuses: Map<number, number> };
const stats = new Map<string, Stat>();
function record(name: string, ms: number, status: number) {
  const s: Stat = stats.get(name) ?? { ms: [], errors: 0, statuses: new Map<number, number>() };
  s.ms.push(ms);
  if (status < 200 || status >= 400) { s.errors++; s.statuses.set(status, (s.statuses.get(status) ?? 0) + 1); }
  stats.set(name, s);
}
const pct = (xs: number[], p: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0; };

class Member {
  cookie = "";
  matchIds: string[] = [];
  constructor(public n: number) {}
  // Each virtual member has their own address, as real members do; rate limits are per member or per address.
  get ip() { return `10.${(this.n >> 16) & 255}.${(this.n >> 8) & 255}.${this.n & 255}`; }
  async call(name: string, method: string, path: string, body?: unknown) {
    const t0 = performance.now();
    let status = 0, data: any = null;
    try {
      const res = await fetch(BASE + path, {
        method, redirect: "manual",
        headers: { "content-type": "application/json", cookie: this.cookie, "x-forwarded-for": this.ip, origin: BASE },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      status = res.status;
      const set = res.headers.get("set-cookie");
      if (set) this.cookie = set.split(";")[0];
      data = await res.json().catch(() => null);
    } catch { status = 0; }
    record(name, performance.now() - t0, status);
    return { status, data };
  }
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) { console.error(`No server at ${BASE}. See the steps at the top of tests/load.ts.`); process.exit(2); }

  console.log(`Load test: ${USERS} members, ${SECONDS}s steady, ${THINK} ms think time, against ${BASE}\n`);

  // Phase 1: everyone signs in, ten at a time (a sign-in rush; password hashing makes this the heaviest call).
  const members = Array.from({ length: USERS }, (_, i) => new Member(i + 1));
  const t1 = performance.now();
  let next = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (next < members.length) {
      const m = members[next++];
      const r = await m.call("POST /api/auth/login", "POST", "/api/auth/login", { email: `user${m.n}@test.local`, password: "Demo!2026" });
      if (r.status !== 200) m.cookie = "";
    }
  }));
  const signedIn = members.filter((m) => m.cookie);
  console.log(`Signed in ${signedIn.length}/${USERS} in ${((performance.now() - t1) / 1000).toFixed(1)}s`);
  if (signedIn.length < USERS * 0.9) { console.error("Fewer than 90% could sign in. Is the database seeded with SEED_SAMPLE_COUNT >= LOAD_USERS?"); report(); process.exit(1); }

  // Phase 2: steady use. Each member loops: mostly browsing, sometimes opening their chats, sometimes sending.
  const until = Date.now() + SECONDS * 1000;
  await Promise.all(signedIn.map(async (m, i) => {
    await sleep((i / signedIn.length) * THINK); // spread the start so requests don't arrive in one burst
    while (Date.now() < until) {
      const roll = rand();
      if (roll < 0.20) await m.call("GET /api/discovery", "GET", "/api/discovery");
      else if (roll < 0.25) await m.call("GET /api/discovery?mode=nearby", "GET", "/api/discovery?mode=nearby");
      else if (roll < 0.50) {
        const r = await m.call("GET /api/matches", "GET", "/api/matches");
        m.matchIds = (r.data?.matches ?? []).map((x: any) => x.id).slice(0, 5);
      }
      else if (roll < 0.60) await m.call("GET /api/me", "GET", "/api/me");
      else if (roll < 0.75) await m.call("GET /api/notifications", "GET", "/api/notifications");
      else if (roll < 0.90 && m.matchIds.length) await m.call("GET /api/matches/[id]/messages", "GET", `/api/matches/${m.matchIds[0]}/messages`);
      else if (m.matchIds.length) await m.call("POST /api/matches/[id]/messages", "POST", `/api/matches/${m.matchIds[0]}/messages`, { body: "Load test message, please ignore." });
      else await m.call("GET /api/likes", "GET", "/api/likes");
      await sleep(THINK * (0.5 + rand()));
    }
  }));

  const failed = report();
  process.exit(failed ? 1 : 0);
}

function report(): boolean {
  let failed = false, total = 0, errors = 0;
  const rows = [...stats.entries()].sort((a, b) => b[1].ms.length - a[1].ms.length);
  console.log(`\n${"endpoint".padEnd(36)} ${"calls".padStart(6)} ${"err".padStart(5)} ${"p50".padStart(7)} ${"p95".padStart(7)} ${"p99".padStart(7)} ${"max".padStart(7)}`);
  for (const [name, s] of rows) {
    total += s.ms.length; errors += s.errors;
    const p95 = pct(s.ms, 95);
    // Sending is limited to 30 a minute per member, and repeating the same line trips the screening rules;
    // refusals there are the limits working, so they don't count against the test.
    const expectedRefusals = name.startsWith("POST /api/matches/") ? (s.statuses.get(429) ?? 0) + (s.statuses.get(400) ?? 0) + (s.statuses.get(403) ?? 0) + (s.statuses.get(409) ?? 0) + (s.statuses.get(422) ?? 0) : 0;
    errors -= expectedRefusals;
    const slow = p95 > P95_LIMIT && !name.startsWith("POST /api/auth/login");
    if (slow) failed = true;
    const codes = [...s.statuses.entries()].map(([c, n]) => `${c || "timeout"}×${n}`).join(" ");
    console.log(`${name.padEnd(36)} ${String(s.ms.length).padStart(6)} ${String(s.errors).padStart(5)} ${pct(s.ms, 50).toFixed(0).padStart(6)}ms ${p95.toFixed(0).padStart(6)}ms ${pct(s.ms, 99).toFixed(0).padStart(6)}ms ${Math.max(0, ...s.ms).toFixed(0).padStart(6)}ms${slow ? "  SLOW" : ""}${codes ? `  [${codes}]` : ""}`);
  }
  const errPct = total ? (errors / total) * 100 : 0;
  console.log(`\n${total} requests, ${(total / Math.max(1, SECONDS)).toFixed(1)} per second over the steady phase (sign-ins included in the count), ${errPct.toFixed(2)}% unexpected errors.`);
  if (errPct > ERR_LIMIT) { failed = true; console.log(`FAIL: more than ${ERR_LIMIT}% errors.`); }
  if (failed) console.log(`FAIL: an endpoint's p95 is over ${P95_LIMIT} ms, or errors are over the limit.`); else console.log(`PASS: every endpoint's p95 is under ${P95_LIMIT} ms and errors are under ${ERR_LIMIT}%.`);
  return failed;
}

main();
