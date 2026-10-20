import "server-only";
import { createHmac, createHash } from "node:crypto";
import { and, count, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "./audit";
import { getConfig } from "./config";
import { seal } from "./crypto";
import { ApiError } from "./http";
import { requireMatch } from "./matches";
import { storage } from "./storage";
import { notify, pushNow } from "./notify";
import { bumpChat } from "./realtime";
import { emitEvent, onEvent, redis } from "./redis";

// Voice and video calls between matched members.
//
// The server never carries audio or video. It decides who may call whom, rings the other person, relays
// the WebRTC connection setup ("signals": offer, answer, network candidates) between the two apps, and
// keeps a short log (who called, when, how long — never content). Media flows directly between the two
// phones, or through a TURN relay when one is configured. With a relay the apps are told to use ONLY the
// relay, so neither person learns the other's IP address (which can reveal roughly where they are).
// Without a relay, calls stay off unless CALLS_ALLOW_DIRECT=true (meant for local testing).

export const RING_MS = 40_000;
const STALE_MS = 35_000; // an active call ends if one side stops checking in for this long
const MAX_SIGNAL_BYTES = 24_000;

type Signal = { seq: number; from: string; type: "offer" | "answer" | "ice"; data: unknown };

// Short-lived call state: connection signals and "last seen" times. In this process for one server, in
// Redis (expiring after 2 hours) when several servers share the work. Ring timers stay on the server
// that started the call; every server also ends rung-out calls when someone checks on them.
type Mem = { signals: Signal[]; seq: number; seen: Map<string, number> };
const g = globalThis as unknown as { __pcCalls?: { mem: Map<string, Mem>; timers: Map<string, NodeJS.Timeout> } };
const hub = g.__pcCalls ??= { mem: new Map(), timers: new Map() };
const memOf = (id: string) => { let l = hub.mem.get(id); if (!l) hub.mem.set(id, l = { signals: [], seq: 0, seen: new Map() }); return l; };
const TTL_S = 7200;
const live = {
  async seen(callId: string, userId: string, at = Date.now()) {
    const r = redis();
    if (r) { await r.multi().hset(`pc:call:${callId}:seen`, userId, String(at)).expire(`pc:call:${callId}:seen`, TTL_S).exec().catch(() => {}); return; }
    memOf(callId).seen.set(userId, at);
  },
  async seenOf(callId: string): Promise<Map<string, number>> {
    const r = redis();
    if (r) { const h = await r.hgetall(`pc:call:${callId}:seen`).catch(() => ({} as Record<string, string>)); return new Map(Object.entries(h).map(([k, v]) => [k, Number(v)])); }
    return memOf(callId).seen;
  },
  async push(callId: string, sig: Omit<Signal, "seq">) {
    const r = redis();
    if (r) {
      const seq = await r.incr(`pc:call:${callId}:seq`);
      await r.multi().rpush(`pc:call:${callId}:sig`, JSON.stringify({ ...sig, seq })).ltrim(`pc:call:${callId}:sig`, -400, -1)
        .expire(`pc:call:${callId}:sig`, TTL_S).expire(`pc:call:${callId}:seq`, TTL_S).exec();
      return seq;
    }
    const l = memOf(callId);
    l.signals.push({ ...sig, seq: ++l.seq });
    if (l.signals.length > 400) l.signals.splice(0, l.signals.length - 400);
    return l.seq;
  },
  async after(callId: string, after: number, notFrom: string): Promise<Signal[]> {
    const r = redis();
    const all: Signal[] = r ? (await r.lrange(`pc:call:${callId}:sig`, 0, -1).catch(() => [])).map((x) => JSON.parse(x)) : memOf(callId).signals;
    return all.filter((x) => x.seq > after && x.from !== notFrom).sort((a, b) => a.seq - b.seq);
  },
  drop(callId: string) {
    const t = hub.timers.get(callId); if (t) clearTimeout(t); hub.timers.delete(callId);
    setTimeout(() => hub.mem.delete(callId), 60_000).unref?.();
  },
};
const wake = (...keys: string[]) => keys.forEach((k) => emitEvent(k));
/** Starts listening at once; `done` resolves on the event or timeout, `cancel` stops listening early. */
function waitEvent(key: string, ms: number, signal?: AbortSignal) {
  let finish = () => {};
  const done = new Promise<void>((resolve) => {
    let over = false;
    const off = onEvent(key, () => finish());
    finish = () => { if (over) return; over = true; off(); clearTimeout(t); resolve(); };
    const t = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
  return { done, cancel: () => finish() };
}

export type CallRow = typeof schema.calls.$inferSelect;

// ---- connection settings handed to the apps --------------------------------------------------------
type Ice = { iceServers: { urls: string[] | string; username?: string; credential?: string }[]; iceTransportPolicy: "all" | "relay"; relay: boolean };
const cloudflare = () => !!(process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN);

/** Cloudflare's TURN service: short-lived credentials per call (the API token never leaves the server). */
async function cloudflareIce(): Promise<Ice["iceServers"] | null> {
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(process.env.CLOUDFLARE_TURN_KEY_ID!)}/credentials/generate-ice-servers`, {
      method: "POST", headers: { authorization: `Bearer ${process.env.CLOUDFLARE_TURN_API_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ ttl: 4 * 3600 }), signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) { console.warn("[calls] Cloudflare TURN credentials failed", res.status); return null; }
    const j = (await res.json()) as { iceServers?: Ice["iceServers"] };
    // Relay-only calls don't need STUN; browsers block port 53, so drop those addresses to avoid timeouts.
    return (j.iceServers ?? []).filter((x) => x.username)
      .map((x) => ({ ...x, urls: (Array.isArray(x.urls) ? x.urls : [x.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))
      .filter((x) => x.urls.length);
  } catch (e) { console.warn("[calls] Cloudflare TURN unreachable", (e as Error).message); return null; }
}

export async function iceConfig(userId: string): Promise<Ice | null> {
  const direct = process.env.CALLS_ALLOW_DIRECT === "true";
  if (cloudflare()) {
    const servers = await cloudflareIce();
    if (servers?.length) return { iceServers: servers, iceTransportPolicy: direct ? "all" : "relay", relay: !direct };
    if (!direct) return null;
  }
  const urls = (process.env.TURN_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!urls.length) {
    if (!direct) return null;
    const stun = (process.env.STUN_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return { iceServers: stun.length ? [{ urls: stun }] : [], iceTransportPolicy: "all", relay: false };
  }
  let username = process.env.TURN_USERNAME ?? "", credential = process.env.TURN_CREDENTIAL ?? "";
  if (process.env.TURN_SECRET) {
    // Short-lived credentials (the coturn "use-auth-secret" scheme): valid 2 hours, the secret never leaves the server.
    const expiry = Math.floor(Date.now() / 1000) + 7200;
    username = `${expiry}:${createHash("sha256").update(userId).digest("hex").slice(0, 16)}`;
    credential = createHmac("sha1", process.env.TURN_SECRET).update(username).digest("base64");
  }
  return { iceServers: [{ urls, username, credential }], iceTransportPolicy: direct ? "all" : "relay", relay: !direct };
}
/** Whether calls can work at all (a relay is set up, or direct calls are allowed for testing). */
export const callsConfigured = () => cloudflare() || !!(process.env.TURN_URLS ?? "").trim() || process.env.CALLS_ALLOW_DIRECT === "true";

// ---- rules -------------------------------------------------------------------------------------------
/** Whether these two can call, and if not, why (shown in the chat). */
export async function callEligibility(matchId: string, userId: string) {
  const { match, otherId } = await requireMatch(matchId, userId);
  if (!(await getConfig("calls.enabled"))) return { ok: false as const, match, otherId, reason: "Calls are switched off for now.", code: "calls_off" };
  if (!callsConfigured()) return { ok: false as const, match, otherId, reason: "Calls aren't available yet.", code: "calls_unavailable" };
  const blocked = await db.query.blocks.findFirst({ where: or(and(eq(schema.blocks.blockerId, userId), eq(schema.blocks.blockedId, otherId)), and(eq(schema.blocks.blockerId, otherId), eq(schema.blocks.blockedId, userId))) });
  if (blocked) return { ok: false as const, match, otherId, reason: "You can't call this person.", code: "blocked" };
  const other = await db.query.users.findFirst({ where: eq(schema.users.id, otherId) });
  if (!other || other.status !== "ACTIVE" || other.deletedAt) return { ok: false as const, match, otherId, reason: "This person isn't available.", code: "unavailable" };
  const need = await getConfig("calls.minMessagesEach");
  if (need > 0) {
    const sent = await db.select({ s: schema.messages.senderId, n: count() }).from(schema.messages)
      .where(and(eq(schema.messages.matchId, match.id), eq(schema.messages.kind, "TEXT"), isNull(schema.messages.deletedAt))).groupBy(schema.messages.senderId);
    const n = (id: string) => sent.find((r) => r.s === id)?.n ?? 0;
    if (n(userId) < need || n(otherId) < need) return { ok: false as const, match, otherId, reason: "Calls unlock once you've both sent a message.", code: "calls_locked" };
  }
  return { ok: true as const, match, otherId, reason: null, code: null };
}

// ---- lifecycle ---------------------------------------------------------------------------------------
async function inCall(userId: string) {
  const rows = await db.select().from(schema.calls).where(and(inArray(schema.calls.state, ["RINGING", "ACTIVE"]), or(eq(schema.calls.callerId, userId), eq(schema.calls.calleeId, userId))));
  const busy: CallRow[] = [];
  for (const c of rows) { const fresh = await settle(c); if (fresh.state !== "ENDED") busy.push(fresh); }
  return busy[0] ?? null;
}

/** Ends calls that rang out or whose other side vanished. Returns the up-to-date row. */
async function settle(c: CallRow): Promise<CallRow> {
  if (c.state === "ENDED") return c;
  const m = await db.query.matches.findFirst({ where: eq(schema.matches.id, c.matchId) });
  if (!m || m.status !== "ACTIVE") return endCall(c, null, "BLOCKED");
  if (c.state === "RINGING" && Date.now() - c.createdAt.getTime() > RING_MS) return endCall(c, null, "MISSED");
  if (c.state === "ACTIVE") {
    const seen = await live.seenOf(c.id);
    const since = (id: string) => Date.now() - (seen.get(id) ?? c.answeredAt?.getTime() ?? 0);
    if (since(c.callerId) > STALE_MS || since(c.calleeId) > STALE_MS) {
      const last = Math.min(seen.get(c.callerId) ?? Date.now(), seen.get(c.calleeId) ?? Date.now());
      return endCall(c, null, "FAILED", new Date(Math.max(last, c.answeredAt?.getTime() ?? last)));
    }
  }
  return c;
}

export async function startCall(user: User, matchId: string, kind: "AUDIO" | "VIDEO") {
  const e = await callEligibility(matchId, user.id);
  if (!e.ok) throw new ApiError(403, e.reason, e.code);
  if (await inCall(user.id)) throw new ApiError(409, "You're already in a call.", "busy");
  if (await inCall(e.otherId)) throw new ApiError(409, "They're on another call. Try again in a bit.", "busy");
  const [c] = await db.insert(schema.calls).values({ matchId: e.match.id, callerId: user.id, calleeId: e.otherId, kind }).returning();
  await live.seen(c.id, user.id);
  const timer = setTimeout(() => { void db.query.calls.findFirst({ where: eq(schema.calls.id, c.id) }).then((r) => r && settle(r)); }, RING_MS + 500);
  timer.unref?.();
  hub.timers.set(c.id, timer);
  await audit(user.id, "call.started", "match", e.match.id, { kind });
  const me = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) });
  void pushNow(e.otherId, { title: `${me?.firstName ?? "Your match"} is calling`, body: kind === "VIDEO" ? "Incoming video call — open the app to answer." : "Incoming voice call — open the app to answer.", link: `/matches/${e.match.id}`, tag: `call:${c.id}`, urgent: true });
  wake(`user:${e.otherId}`, `call:${c.id}`);
  return c;
}

export async function endCall(c: CallRow, byId: string | null, reason: "DECLINED" | "MISSED" | "HUNG_UP" | "CANCELLED" | "FAILED" | "BLOCKED", at = new Date()) {
  const [row] = await db.update(schema.calls).set({ state: "ENDED", endReason: reason, endedById: byId, endedAt: at })
    .where(and(eq(schema.calls.id, c.id), inArray(schema.calls.state, ["RINGING", "ACTIVE"]))).returning();
  if (!row) return (await db.query.calls.findFirst({ where: eq(schema.calls.id, c.id) }))!;
  live.drop(c.id);
  wake(`call:${c.id}`, `user:${c.calleeId}`, `user:${c.callerId}`);
  if (reason === "BLOCKED") return row; // the conversation has ended: no chat line, no notification
  // A line in the chat so both people can see the call happened.
  const what = c.kind === "VIDEO" ? "video call" : "voice call";
  const secs = row.answeredAt ? Math.max(0, Math.round((row.endedAt!.getTime() - row.answeredAt.getTime()) / 1000)) : 0;
  const length = secs < 3600 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : `${Math.floor(secs / 3600)} h ${Math.floor((secs % 3600) / 60)} min`;
  const body = row.answeredAt ? `${what[0].toUpperCase()}${what.slice(1)} · ${length}` : reason === "DECLINED" ? `Declined ${what}` : `Missed ${what}`;
  await db.insert(schema.messages).values({ matchId: c.matchId, senderId: c.callerId, kind: "SYSTEM", body: seal(body, c.matchId) });
  bumpChat(c.matchId);
  if (!row.answeredAt && (reason === "MISSED" || reason === "CANCELLED")) {
    const caller = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, c.callerId) });
    await notify(c.calleeId, "MESSAGE", `Missed ${what} from ${caller?.firstName ?? "your match"}`, "Call back from your chat when you're free.", `/matches/${c.matchId}`);
  }
  return row;
}

/** Loads a call the user is part of. */
export async function requireCall(callId: string, userId: string) {
  const c = await db.query.calls.findFirst({ where: and(eq(schema.calls.id, callId), or(eq(schema.calls.callerId, userId), eq(schema.calls.calleeId, userId))) });
  if (!c) throw new ApiError(404, "This call doesn't exist.", "not_found");
  return settle(c);
}

export async function actOnCall(user: User, callId: string, action: "accept" | "decline" | "end") {
  const c = await requireCall(callId, user.id);
  if (c.state === "ENDED") return c;
  if (action === "accept") {
    if (c.calleeId !== user.id) throw new ApiError(403, "Only the person being called can answer.", "forbidden");
    if (c.state !== "RINGING") return c;
    const e = await callEligibility(c.matchId, user.id).catch(() => null);
    if (!e?.ok) return endCall(c, user.id, "BLOCKED");
    const [row] = await db.update(schema.calls).set({ state: "ACTIVE", answeredAt: new Date() }).where(and(eq(schema.calls.id, c.id), eq(schema.calls.state, "RINGING"))).returning();
    const t = hub.timers.get(c.id); if (t) clearTimeout(t);
    await live.seen(c.id, user.id); await live.seen(c.id, c.callerId);
    wake(`call:${c.id}`, `user:${c.calleeId}`);
    return row ?? c;
  }
  if (action === "decline") return endCall(c, user.id, c.calleeId === user.id && c.state === "RINGING" ? "DECLINED" : c.state === "RINGING" ? "CANCELLED" : "HUNG_UP");
  return endCall(c, user.id, c.state === "RINGING" ? (c.callerId === user.id ? "CANCELLED" : "DECLINED") : "HUNG_UP");
}

/** Called when someone blocks, reports or unmatches: any call between them ends at once. */
export async function endCallsBetween(a: string, b: string) {
  const rows = await db.select().from(schema.calls).where(and(inArray(schema.calls.state, ["RINGING", "ACTIVE"]),
    or(and(eq(schema.calls.callerId, a), eq(schema.calls.calleeId, b)), and(eq(schema.calls.callerId, b), eq(schema.calls.calleeId, a)))));
  for (const c of rows) await endCall(c, a, "BLOCKED");
}

// ---- signalling ----------------------------------------------------------------------------------------
export async function sendSignal(user: User, callId: string, type: Signal["type"], data: unknown) {
  const c = await requireCall(callId, user.id);
  if (c.state === "ENDED") throw new ApiError(410, "The call has ended.", "call_ended");
  if (JSON.stringify(data ?? null).length > MAX_SIGNAL_BYTES) throw new ApiError(413, "Too large.", "too_large");
  if (type === "offer" && c.state === "RINGING" && c.callerId !== user.id) throw new ApiError(409, "Answer the call first.", "not_answered");
  await live.seen(c.id, user.id);
  const seq = await live.push(c.id, { from: user.id, type, data });
  wake(`call:${c.id}`);
  return { seq };
}

const view = (c: CallRow, me: string) => ({
  id: c.id, matchId: c.matchId, kind: c.kind, state: c.state, endReason: c.endReason, incoming: c.calleeId === me,
  createdAt: c.createdAt, answeredAt: c.answeredAt, endedAt: c.endedAt, ringsUntil: new Date(c.createdAt.getTime() + RING_MS),
});
export { view as callView };

/** Long poll: the call's state and signals from the other person after `after`. Also counts as "still here". */
export async function pollCall(user: User, callId: string, after: number, waitMs: number, signal?: AbortSignal) {
  const first = await requireCall(callId, user.id);
  await live.seen(callId, user.id);
  // Listen before looking, so a signal that lands in between isn't missed.
  const woken = waitMs > 0 && first.state !== "ENDED" ? waitEvent(`call:${callId}`, Math.min(waitMs, 20_000), signal) : null;
  let pending = await live.after(callId, after, user.id);
  if (!woken || pending.length) { woken?.cancel(); return { call: view(first, user.id), signals: pending }; }
  await woken.done;
  await live.seen(callId, user.id);
  const c = (await db.query.calls.findFirst({ where: eq(schema.calls.id, callId) }))!;
  const fresh = c.state === first.state ? await settle(c) : c;
  pending = await live.after(callId, after, user.id);
  return { call: view(fresh, user.id), signals: pending };
}

/** Long poll for the app: is someone calling me right now? */
export async function waitForIncoming(user: User, waitMs: number, signal?: AbortSignal) {
  const find = async () => {
    const rows = await db.select().from(schema.calls).where(and(eq(schema.calls.calleeId, user.id), eq(schema.calls.state, "RINGING")));
    for (const r of rows) { const s = await settle(r); if (s.state === "RINGING") return s; }
    return null;
  };
  const woken = waitMs > 0 ? waitEvent(`user:${user.id}`, Math.min(waitMs, 25_000), signal) : null;
  let c = await find();
  if (!c && woken) { await woken.done; c = await find(); } else woken?.cancel();
  if (!c) return { call: null };
  const caller = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, c.callerId) });
  const photo = await db.query.photos.findFirst({ where: and(eq(schema.photos.userId, c.callerId), eq(schema.photos.status, "LIVE")), orderBy: schema.photos.position });
  return { call: { ...view(c, user.id), from: { userId: c.callerId, name: caller?.firstName ?? "Your match", photo: photo ? await storage().url(photo.storageKey) : null } } };
}
