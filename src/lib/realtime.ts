import "server-only";
import { EventEmitter } from "node:events";

// Instant chat updates without an extra service: the app holds a request open (long polling) and this
// in-process hub answers it the moment something changes in that conversation — a new or deleted message,
// a read receipt, or the other person typing. One app server today; with several servers, swap this hub
// for Redis pub/sub (same three functions).
type Hub = { em: EventEmitter; version: Map<string, number>; typing: Map<string, Map<string, number>> };
const g = globalThis as unknown as { __pcHub?: Hub };
const hub: Hub = g.__pcHub ??= { em: Object.assign(new EventEmitter(), {}).setMaxListeners(10_000), version: new Map(), typing: new Map() };

export const TYPING_MS = 6_000;

export function chatVersion(matchId: string) { return hub.version.get(matchId) ?? 0; }

/** Something changed in this conversation (message sent, deleted, read). */
export function bumpChat(matchId: string) {
  hub.version.set(matchId, chatVersion(matchId) + 1);
  hub.em.emit(matchId);
}

export function setTyping(matchId: string, userId: string, on: boolean, announce = true) {
  const m = hub.typing.get(matchId) ?? new Map<string, number>();
  if (on) m.set(userId, Date.now() + TYPING_MS); else m.delete(userId);
  hub.typing.set(matchId, m);
  if (announce) hub.em.emit(matchId);
}

export function isTyping(matchId: string, userId: string) {
  const until = hub.typing.get(matchId)?.get(userId) ?? 0;
  return until > Date.now();
}

/**
 * Resolves as soon as the conversation's version differs from `since` or the other person's typing state
 * differs from `typingWas`, or after `timeoutMs`.
 */
export function waitForChat(matchId: string, otherId: string, since: number, typingWas: boolean, timeoutMs: number, signal?: AbortSignal) {
  return new Promise<{ version: number; typing: boolean }>((resolve) => {
    const state = () => ({ version: chatVersion(matchId), typing: isTyping(matchId, otherId) });
    const now = state();
    if (now.version !== since || now.typing !== typingWas) return resolve(now);
    let done = false;
    const finish = () => { if (done) return; done = true; hub.em.off(matchId, check); clearTimeout(t); clearTimeout(expire); resolve(state()); };
    const check = () => { const s = state(); if (s.version !== since || s.typing !== typingWas) finish(); };
    const t = setTimeout(finish, timeoutMs);
    // A typing indicator ends by itself: wake up when it would expire.
    const until = hub.typing.get(matchId)?.get(otherId) ?? 0;
    const expire = setTimeout(check, Math.max(0, Math.min(timeoutMs, until - Date.now() + 50)));
    hub.em.on(matchId, check);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
