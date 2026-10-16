import "server-only";
import { createHmac, createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { and, count, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "./audit";
import { getConfig } from "./config";
import { seal } from "./crypto";
import { ApiError } from "./http";
import { requireMatch } from "./matches";
import { storage } from "./storage";
import { notify } from "./notify";
import { bumpChat } from "./realtime";

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
type Live = { signals: Signal[]; seq: number; seen: Map<string, number>; ringTimer?: NodeJS.Timeout };
type Hub = { em: EventEmitter; live: Map<string, Live> };
const g = globalThis as unknown as { __pcCalls?: Hub };
const hub: Hub = g.__pcCalls ??= { em: new EventEmitter().setMaxListeners(10_000), live: new Map() };
const liveOf = (id: string) => { let l = hub.live.get(id); if (!l) hub.live.set(id, l = { signals: [], seq: 0, seen: new Map() }); return l; };
const wake = (...keys: string[]) => keys.forEach((k) => hub.em.emit(k));

export type CallRow = typeof schema.calls.$inferSelect;

// ---- connection settings handed to the apps --------------------------------------------------------
export function iceConfig(userId: string) {
  const urls = (process.env.TURN_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const direct = process.env.CALLS_ALLOW_DIRECT === "true";
  if (!urls.length) {
    if (!direct) return null;
    const stun = (process.env.STUN_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return { iceServers: stun.length ? [{ urls: stun }] : [], iceTransportPolicy: "all" as const, relay: false };
  }
  let username = process.env.TURN_USERNAME ?? "", credential = process.env.TURN_CREDENTIAL ?? "";
  if (process.env.TURN_SECRET) {
    // Short-lived credentials (the coturn "use-auth-secret" scheme): valid 2 hours, the secret never leaves the server.
    const expiry = Math.floor(Date.now() / 1000) + 7200;
    username = `${expiry}:${createHash("sha256").update(userId).digest("hex").slice(0, 16)}`;
    credential = createHmac("sha1", process.env.TURN_SECRET).update(username).digest("base64");
  }
  return { iceServers: [{ urls, username, credential }], iceTransportPolicy: direct ? ("all" as const) : ("relay" as const), relay: !direct };
}
export const callsConfigured = () => iceConfig("probe") !== null;

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
    const l = liveOf(c.id);
    const since = (id: string) => Date.now() - (l.seen.get(id) ?? c.answeredAt?.getTime() ?? 0);
    if (since(c.callerId) > STALE_MS || since(c.calleeId) > STALE_MS) {
      const last = Math.min(l.seen.get(c.callerId) ?? Date.now(), l.seen.get(c.calleeId) ?? Date.now());
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
  const l = liveOf(c.id);
  l.seen.set(user.id, Date.now());
  l.ringTimer = setTimeout(() => { void db.query.calls.findFirst({ where: eq(schema.calls.id, c.id) }).then((r) => r && settle(r)); }, RING_MS + 500);
  l.ringTimer.unref?.();
  await audit(user.id, "call.started", "match", e.match.id, { kind });
  wake(`user:${e.otherId}`, `call:${c.id}`);
  return c;
}

export async function endCall(c: CallRow, byId: string | null, reason: "DECLINED" | "MISSED" | "HUNG_UP" | "CANCELLED" | "FAILED" | "BLOCKED", at = new Date()) {
  const [row] = await db.update(schema.calls).set({ state: "ENDED", endReason: reason, endedById: byId, endedAt: at })
    .where(and(eq(schema.calls.id, c.id), inArray(schema.calls.state, ["RINGING", "ACTIVE"]))).returning();
  if (!row) return (await db.query.calls.findFirst({ where: eq(schema.calls.id, c.id) }))!;
  const l = hub.live.get(c.id);
  if (l?.ringTimer) clearTimeout(l.ringTimer);
  setTimeout(() => hub.live.delete(c.id), 60_000).unref?.();
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
    const l = liveOf(c.id);
    if (l.ringTimer) clearTimeout(l.ringTimer);
    l.seen.set(user.id, Date.now()); l.seen.set(c.callerId, Date.now());
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
  const l = liveOf(c.id);
  l.seen.set(user.id, Date.now());
  l.signals.push({ seq: ++l.seq, from: user.id, type, data });
  if (l.signals.length > 400) l.signals.splice(0, l.signals.length - 400);
  wake(`call:${c.id}`);
  return { seq: l.seq };
}

const view = (c: CallRow, me: string) => ({
  id: c.id, matchId: c.matchId, kind: c.kind, state: c.state, endReason: c.endReason, incoming: c.calleeId === me,
  createdAt: c.createdAt, answeredAt: c.answeredAt, endedAt: c.endedAt, ringsUntil: new Date(c.createdAt.getTime() + RING_MS),
});
export { view as callView };

/** Long poll: the call's state and signals from the other person after `after`. Also counts as "still here". */
export async function pollCall(user: User, callId: string, after: number, waitMs: number, signal?: AbortSignal) {
  const first = await requireCall(callId, user.id);
  const l = liveOf(callId);
  l.seen.set(user.id, Date.now());
  const pending = () => l.signals.filter((s) => s.seq > after && s.from !== user.id);
  if (first.state === "ENDED" || pending().length || waitMs <= 0) return { call: view(first, user.id), signals: pending() };
  const startState = first.state;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; hub.em.off(`call:${callId}`, finish); clearTimeout(t); resolve(); };
    const t = setTimeout(finish, Math.min(waitMs, 20_000));
    hub.em.on(`call:${callId}`, finish);
    signal?.addEventListener("abort", finish, { once: true });
  });
  l.seen.set(user.id, Date.now());
  const c = (await db.query.calls.findFirst({ where: eq(schema.calls.id, callId) }))!;
  const fresh = c.state === startState ? await settle(c) : c;
  return { call: view(fresh, user.id), signals: pending() };
}

/** Long poll for the app: is someone calling me right now? */
export async function waitForIncoming(user: User, waitMs: number, signal?: AbortSignal) {
  const find = async () => {
    const rows = await db.select().from(schema.calls).where(and(eq(schema.calls.calleeId, user.id), eq(schema.calls.state, "RINGING")));
    for (const r of rows) { const s = await settle(r); if (s.state === "RINGING") return s; }
    return null;
  };
  let c = await find();
  if (!c && waitMs > 0) {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; hub.em.off(`user:${user.id}`, finish); clearTimeout(t); resolve(); };
      const t = setTimeout(finish, Math.min(waitMs, 25_000));
      hub.em.on(`user:${user.id}`, finish);
      signal?.addEventListener("abort", finish, { once: true });
    });
    c = await find();
  }
  if (!c) return { call: null };
  const caller = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, c.callerId) });
  const photo = await db.query.photos.findFirst({ where: and(eq(schema.photos.userId, c.callerId), eq(schema.photos.status, "LIVE")), orderBy: schema.photos.position });
  return { call: { ...view(c, user.id), from: { userId: c.callerId, name: caller?.firstName ?? "Your match", photo: photo ? await storage().url(photo.storageKey) : null } } };
}
