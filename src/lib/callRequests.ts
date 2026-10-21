import "server-only";
import { and, count, desc, eq, gte, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "./audit";
import { ApiError } from "./http";
import { notify } from "./notify";
import { isBlockedBetween } from "./people";
import { rateLimit } from "./ratelimit";
import { assertCanStartContact, assertNotPaused } from "./safety";
import { bumpChat } from "./realtime";
import { addRiskSignal } from "./risk";
import { storage } from "./storage";

// Call requests: nobody can be called without saying yes first.
//  1. One person sends a request (from the chat or the match's profile).
//  2. The other gets "[Name] wants to call you" and chooses Accept or Decline (or Block / Report).
//  3. Only after Accept can a call start — and even then the phone rings and has to be answered.
// An accepted request lets either of them call for 24 hours. After a decline the same person can't ask
// again for 7 days, and after 3 declines not at all (unless the other person asks them).

const HOUR = 3_600_000, DAY = 24 * HOUR;
export const PENDING_MS = DAY;
export const ACCEPTED_MS = DAY;
const COOLDOWN_MS = 7 * DAY;
const MAX_DECLINES = 3;
const SPAM_PER_DAY = 8;

export type CallRequestRow = typeof schema.callRequests.$inferSelect;
type Kind = "AUDIO" | "VIDEO";

async function expireOld(rows: CallRequestRow[]) {
  const now = Date.now();
  const stale = rows.filter((r) => (r.state === "PENDING" || r.state === "ACCEPTED") && r.expiresAt.getTime() <= now);
  if (stale.length) await db.update(schema.callRequests).set({ state: "EXPIRED" }).where(inArray(schema.callRequests.id, stale.map((r) => r.id)));
  return rows.map((r) => (stale.includes(r) ? { ...r, state: "EXPIRED" } : r));
}

async function requestsFor(matchId: string) {
  return expireOld(await db.select().from(schema.callRequests).where(eq(schema.callRequests.matchId, matchId)).orderBy(desc(schema.callRequests.createdAt)).limit(50));
}

/** True when an accepted, unexpired request exists between these two in this match. */
export async function hasCallConsent(matchId: string) {
  return (await requestsFor(matchId)).some((r) => r.state === "ACCEPTED");
}

const view = (r: CallRequestRow, me: string) => ({
  id: r.id, kind: r.kind, state: r.state, mine: r.fromId === me, createdAt: r.createdAt, respondedAt: r.respondedAt, expiresAt: r.expiresAt,
});

/** Why this person can't ask to call right now (null = they can). */
async function blocker(matchId: string, me: string, other: string, rows: CallRequestRow[]) {
  if (rows.some((r) => r.state === "ACCEPTED")) return { code: "already_accepted", reason: "They've already said yes — you can call now." };
  if (rows.some((r) => r.state === "PENDING" && r.fromId === me)) return { code: "pending", reason: "Your call request is waiting for an answer." };
  if (rows.some((r) => r.state === "PENDING" && r.fromId === other)) return { code: "they_asked", reason: "They've asked to call you — accept or decline their request." };
  const declined = rows.filter((r) => r.fromId === me && r.state === "DECLINED");
  const theyAskedSince = (t: number) => rows.some((r) => r.fromId === other && r.createdAt.getTime() > t);
  if (declined.length >= MAX_DECLINES && !theyAskedSince(declined[0].respondedAt?.getTime() ?? 0))
    return { code: "declined_limit", reason: "They've declined your call requests. You can keep chatting, or wait for them to ask you." };
  const last = declined[0];
  if (last?.respondedAt && Date.now() - last.respondedAt.getTime() < COOLDOWN_MS && !theyAskedSince(last.respondedAt.getTime()))
    return { code: "declined_recently", reason: "They declined your last request. You can ask again in a few days." };
  const prefs = await db.query.preferences.findFirst({ where: eq(schema.preferences.userId, other) });
  if (prefs?.callRequests === "NOBODY") return { code: "not_accepting", reason: "They aren't taking call requests right now." };
  void matchId;
  return null;
}

/** The chat's call state: the current request, whether a call can start, and whether a request can be sent. */
export async function callRequestState(matchId: string, me: string, other: string) {
  const rows = await requestsFor(matchId);
  const current = rows.find((r) => r.state === "PENDING" || r.state === "ACCEPTED") ?? rows[0] ?? null;
  const stop = await blocker(matchId, me, other, rows);
  return {
    request: current ? view(current, me) : null,
    canCall: rows.some((r) => r.state === "ACCEPTED"),
    canRequest: !stop,
    requestBlockedReason: stop?.reason ?? null, requestBlockedCode: stop?.code ?? null,
  };
}

async function activeMatchBetween(a: string, b: string) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return db.query.matches.findFirst({ where: and(eq(schema.matches.userAId, x), eq(schema.matches.userBId, y), eq(schema.matches.status, "ACTIVE")) });
}

/** Sends a call request to someone you've matched with. */
export async function createCallRequest(user: User, input: { matchId?: string; userId?: string; kind: Kind }, eligibility: (matchId: string, userId: string) => Promise<{ ok: boolean; reason: string | null; code: string | null; otherId: string }>) {
  await rateLimit(`callreq:${user.id}`, 5, HOUR);
  assertCanStartContact(user);
  let matchId = input.matchId;
  if (!matchId && input.userId) matchId = (await activeMatchBetween(user.id, input.userId))?.id;
  if (!matchId) throw new ApiError(403, "You can ask to call people you've matched with.", "not_matched");
  const e = await eligibility(matchId, user.id); // matched, not blocked, calls on, both have messaged (consent is checked here instead)
  if (!e.ok && e.code !== "needs_request") throw new ApiError(403, e.reason ?? "Calls aren't available.", e.code ?? "calls_unavailable");
  const other = e.otherId;
  if (await isBlockedBetween(user.id, other)) throw new ApiError(403, "You can't call this person.", "blocked");
  await assertNotPaused(other);
  const rows = await requestsFor(matchId);
  const stop = await blocker(matchId, user.id, other, rows);
  if (stop) throw new ApiError(409, stop.reason, stop.code);

  const [r] = await db.insert(schema.callRequests).values({ matchId, fromId: user.id, toId: other, kind: input.kind, expiresAt: new Date(Date.now() + PENDING_MS) }).returning();
  await audit(user.id, "call_request.sent", "match", matchId, { kind: input.kind });

  // Spam: many requests to different people in a day is a pattern worth a look (never blocks by itself).
  const [{ n }] = await db.select({ n: count() }).from(schema.callRequests).where(and(eq(schema.callRequests.fromId, user.id), gte(schema.callRequests.createdAt, new Date(Date.now() - DAY))));
  if (n > SPAM_PER_DAY) await addRiskSignal(user.id, "CALL_REQUEST_SPAM", 20, `${n} call requests in 24 hours`).catch(() => {});

  const me = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) });
  const name = me?.firstName ?? "Your match";
  await notify(other, "CALL", `${name} wants to call you`, `${input.kind === "VIDEO" ? "Video" : "Voice"} call request. Open the chat to accept or decline — you won't be connected unless you accept.`, `/matches/${matchId}`);
  bumpChat(matchId);
  return view(r, user.id);
}

/** Accept / decline (the person asked), cancel (the person asking), or stop allowing calls (either, after accepting). */
export async function respondToCallRequest(user: User, id: string, action: "accept" | "decline" | "cancel" | "revoke") {
  const r = await db.query.callRequests.findFirst({ where: and(eq(schema.callRequests.id, id), or(eq(schema.callRequests.fromId, user.id), eq(schema.callRequests.toId, user.id))) });
  if (!r) throw new ApiError(404, "Call request not found.", "not_found");
  const [fresh] = await expireOld([r]);
  const set = async (state: string, extra: Partial<CallRequestRow> = {}) => {
    await db.update(schema.callRequests).set({ state, respondedAt: new Date(), ...extra }).where(eq(schema.callRequests.id, r.id));
    bumpChat(r.matchId);
  };
  if (action === "accept" || action === "decline") {
    if (r.toId !== user.id) throw new ApiError(403, "Only the person asked can answer.", "forbidden");
    if (fresh.state !== "PENDING") throw new ApiError(409, fresh.state === "EXPIRED" ? "This request has expired." : "This request has already been answered.", "not_pending");
    if (action === "decline") { await set("DECLINED"); await audit(user.id, "call_request.declined", "match", r.matchId); return { state: "DECLINED" }; }
    if (await isBlockedBetween(r.fromId, r.toId)) throw new ApiError(410, "This match has ended.", "match_ended");
    await set("ACCEPTED", { expiresAt: new Date(Date.now() + ACCEPTED_MS) });
    await audit(user.id, "call_request.accepted", "match", r.matchId);
    await notify(r.fromId, "CALL", "Call request accepted", "Call request accepted. You can now start the call.", `/matches/${r.matchId}`);
    return { state: "ACCEPTED" };
  }
  if (action === "cancel") {
    if (r.fromId !== user.id) throw new ApiError(403, "Only the person who asked can cancel.", "forbidden");
    if (fresh.state !== "PENDING") throw new ApiError(409, "This request has already been answered.", "not_pending");
    await set("CANCELLED");
    return { state: "CANCELLED" };
  }
  if (fresh.state !== "ACCEPTED") throw new ApiError(409, "Calls aren't currently allowed.", "not_accepted");
  await set("CANCELLED");
  await audit(user.id, "call_request.revoked", "match", r.matchId);
  return { state: "CANCELLED" };
}

/** Ends any pending or accepted request between two people (blocking, reporting, unmatching). */
export async function cancelCallRequestsBetween(a: string, b: string) {
  await db.update(schema.callRequests).set({ state: "CANCELLED", respondedAt: new Date() })
    .where(and(inArray(schema.callRequests.state, ["PENDING", "ACCEPTED"]), or(and(eq(schema.callRequests.fromId, a), eq(schema.callRequests.toId, b)), and(eq(schema.callRequests.fromId, b), eq(schema.callRequests.toId, a)))));
}

const CALL_OUTCOME: Record<string, string> = { DECLINED: "Declined", MISSED: "Missed", CANCELLED: "Cancelled", FAILED: "Dropped", BLOCKED: "Ended", HUNG_UP: "Completed" };
const REQ_OUTCOME = (state: string, mine: boolean) => ({ PENDING: mine ? "Request sent" : "Wants to call you", ACCEPTED: "Accepted", DECLINED: "Declined", CANCELLED: "Cancelled", EXPIRED: "Expired" }[state] ?? state);

/** Call history: calls and call requests, newest first, with the other person's first name and photo. */
export async function callHistory(user: User) {
  const [calls, reqs] = await Promise.all([
    db.select().from(schema.calls).where(or(eq(schema.calls.callerId, user.id), eq(schema.calls.calleeId, user.id))).orderBy(desc(schema.calls.createdAt)).limit(100),
    expireOld(await db.select().from(schema.callRequests).where(or(eq(schema.callRequests.fromId, user.id), eq(schema.callRequests.toId, user.id))).orderBy(desc(schema.callRequests.createdAt)).limit(100)),
  ]);
  const others = [...new Set([...calls.map((c) => (c.callerId === user.id ? c.calleeId : c.callerId)), ...reqs.map((r) => (r.fromId === user.id ? r.toId : r.fromId))])];
  const profiles = others.length ? await db.select({ id: schema.profiles.userId, name: schema.profiles.firstName }).from(schema.profiles).where(inArray(schema.profiles.userId, others)) : [];
  const photos = others.length ? await db.select({ id: schema.photos.userId, key: schema.photos.storageKey, pos: schema.photos.position }).from(schema.photos).where(and(inArray(schema.photos.userId, others), eq(schema.photos.status, "LIVE"))) : [];
  const person = async (id: string) => {
    const ph = photos.filter((p) => p.id === id).sort((a, b) => a.pos - b.pos)[0];
    return { userId: id, name: profiles.find((p) => p.id === id)?.name ?? "Member", photo: ph ? await storage().url(ph.key) : null };
  };
  const items = [
    ...(await Promise.all(calls.map(async (c) => {
      const secs = c.answeredAt && c.endedAt ? Math.round((c.endedAt.getTime() - c.answeredAt.getTime()) / 1000) : null;
      const outcome = c.state !== "ENDED" ? "In progress" : c.answeredAt ? "Completed" : CALL_OUTCOME[c.endReason ?? ""] ?? "Ended";
      return { type: "CALL" as const, id: c.id, matchId: c.matchId, kind: c.kind, at: c.createdAt, outgoing: c.callerId === user.id, durationSec: secs, outcome, with: await person(c.callerId === user.id ? c.calleeId : c.callerId) };
    }))),
    ...(await Promise.all(reqs.map(async (r) => ({
      type: "REQUEST" as const, id: r.id, matchId: r.matchId, kind: r.kind, at: r.createdAt, outgoing: r.fromId === user.id, durationSec: null, outcome: REQ_OUTCOME(r.state, r.fromId === user.id), state: r.state,
      with: await person(r.fromId === user.id ? r.toId : r.fromId),
    })))),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return items.slice(0, 120);
}

