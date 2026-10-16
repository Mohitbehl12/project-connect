// Two app servers sharing Redis: proves chat, typing, calls and rate limits work when the two people are
// connected to different servers. Needs two servers started with the same REDIS_URL and database:
//   REDIS_URL=redis://127.0.0.1:6379 npx next start -p 3000   and   … -p 3001
// then: npx tsx tests/multi-server.ts   (uses the local sample accounts; creates and removes one test match)
import "../scripts/env";
import { createClient } from "@libsql/client";

const S1 = process.env.SERVER1 ?? "http://localhost:3000";
const S2 = process.env.SERVER2 ?? "http://localhost:3001";
let passed = 0; const failures: string[] = [];
const check = (name: string, ok: unknown, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); } else { failures.push(name); console.log(`  ✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 300)); }
};
const run = Date.now().toString(36);

async function call(base: string, token: string, method: string, path: string, body?: unknown, ip = `10.9.${run.length}.1`) {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-forwarded-for": ip }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) as any };
}
async function token(email: string, password: string) {
  const r = await fetch(`${S1}/api/auth/token`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.8.${email.length}.${run.length}` }, body: JSON.stringify({ email, password, platform: "android" }) });
  const d = await r.json() as any;
  if (!d.accessToken) throw new Error(`login failed for ${email}: ${JSON.stringify(d)}`);
  return d.accessToken as string;
}

async function main() {
  console.log(`Two servers: ${S1} and ${S2}`);
  const db = createClient({ url: process.env.DATABASE_URL! });
  // Two fresh sample people (fictional) matched for this test, so nothing real is touched.
  const people = (await db.execute(`select u.id, u.email, p.gender from users u join profiles p on p.user_id=u.id where u.email like 'user%@test.local' and u.email != 'user5@test.local' and u.status='ACTIVE' and u.deleted_at is null order by u.email limit 40`)).rows as any[];
  const a = people.find((p) => p.gender === "WOMAN"), b = people.find((p) => p.gender === "MAN");
  const [ua, ub] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  await db.execute({ sql: "delete from matches where user_a_id=? and user_b_id=?", args: [ua, ub] });
  await db.execute({ sql: "delete from blocks where (blocker_id=? and blocked_id=?) or (blocker_id=? and blocked_id=?)", args: [a.id, b.id, b.id, a.id] });
  const matchId = crypto.randomUUID();
  await db.execute({ sql: "insert into matches (id, user_a_id, user_b_id, score, reasons, status, created_at) values (?, ?, ?, 80, '[]', 'ACTIVE', ?)", args: [matchId, ua, ub, Date.now()] });
  const ta = await token(a.email, "Demo!2026"), tb = await token(b.email, "Demo!2026");

  try {
    console.log("\nChat across servers");
    const v0 = (await call(S1, ta, "GET", `/api/matches/${matchId}/wait?v=-1&wait=0`)).data?.version ?? 0;
    let t = Date.now();
    const waitTyping = call(S1, ta, "GET", `/api/matches/${matchId}/wait?v=${v0}&typing=0&wait=10000`);
    await new Promise((r) => setTimeout(r, 400));
    await call(S2, tb, "POST", `/api/matches/${matchId}/typing`, { typing: true });
    const typed = await waitTyping;
    check("typing on server 2 shows at once on server 1", typed.data?.typing === true && Date.now() - t < 3000, typed.data);
    t = Date.now();
    const waitMsg = call(S1, ta, "GET", `/api/matches/${matchId}/wait?v=${typed.data?.version}&typing=1&wait=10000`);
    await new Promise((r) => setTimeout(r, 400));
    await call(S2, tb, "POST", `/api/matches/${matchId}/messages`, { body: "Sent through server 2" });
    const got = await waitMsg;
    check("a message sent via server 2 wakes the phone waiting on server 1", got.data?.version > typed.data?.version && Date.now() - t < 3000, got.data);
    const v1 = (await call(S2, ta, "GET", `/api/matches/${matchId}/wait?v=-1&wait=0`)).data?.version;
    check("both servers agree on the conversation's version", v1 === got.data?.version, { v1, v: got.data?.version });
    await call(S1, ta, "POST", `/api/matches/${matchId}/messages`, { body: "Got it on server 1" });

    console.log("\nCalls across servers");
    t = Date.now();
    const ring = call(S1, ta, "GET", "/api/calls/incoming?wait=10000");
    await new Promise((r) => setTimeout(r, 400));
    const start = await call(S2, tb, "POST", `/api/matches/${matchId}/call`, { kind: "VIDEO" });
    const rung = await ring;
    const callId = start.data?.call?.id;
    check("a call started on server 2 rings on server 1 at once", !!callId && rung.data?.call?.id === callId && Date.now() - t < 3000, { start: start.data, rung: rung.data });
    await call(S2, tb, "POST", `/api/calls/${callId}/signal`, { type: "offer", data: { type: "offer", sdp: "v=0 s2" } });
    await call(S1, ta, "POST", `/api/calls/${callId}`, { action: "accept" });
    const offers = await call(S1, ta, "GET", `/api/calls/${callId}?after=0&wait=0`);
    check("the offer sent to server 2 is read on server 1", offers.data?.signals?.[0]?.type === "offer" && offers.data.call.state === "ACTIVE", offers.data);
    t = Date.now();
    const waitAnswer = call(S2, tb, "GET", `/api/calls/${callId}?after=0&wait=10000`);
    await new Promise((r) => setTimeout(r, 400));
    await call(S1, ta, "POST", `/api/calls/${callId}/signal`, { type: "answer", data: { type: "answer", sdp: "v=0 s1" } });
    const ans = await waitAnswer;
    check("the answer sent to server 1 reaches the caller on server 2 at once", ans.data?.signals?.some((x: any) => x.type === "answer") && Date.now() - t < 3000, ans.data);
    const waitEnd = call(S2, tb, "GET", `/api/calls/${callId}?after=99&wait=10000`);
    await new Promise((r) => setTimeout(r, 400));
    await call(S1, ta, "POST", `/api/calls/${callId}`, { action: "end" });
    const ended = await waitEnd;
    check("hanging up on server 1 ends the call on server 2", ended.data?.call?.state === "ENDED", ended);

    console.log("\nRate limits are shared");
    const ip = `10.77.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await fetch(`${i % 2 ? S2 : S1}/api/auth/forgot`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ email: `nobody${i}-${run}@test.local` }) });
      codes.push(r.status);
    }
    check("10 tries per hour in total across both servers, not 10 on each", codes.slice(0, 10).every((c) => c === 200) && codes[10] === 429, codes);
  } finally {
    await db.execute({ sql: "delete from matches where id=?", args: [matchId] });
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
