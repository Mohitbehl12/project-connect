import "server-only";
import { emitEvent, onEvent, redis } from "./redis";

// Instant chat updates without an extra service: the app holds a request open (long polling) and this
// hub answers it the moment something changes in that conversation — a new or deleted message, a read
// receipt, or the other person typing.
//
// One server: everything lives in this process. Several servers (REDIS_URL set): the conversation's
// version number lives in Redis so every server agrees on it, and changes and typing are broadcast to all
// servers, so a phone waiting on one server hears about a message sent through another.
type Hub = { version: Map<string, number>; typing: Map<string, Map<string, number>>; wired: boolean };
const g = globalThis as unknown as { __pcHub?: Hub };
const hub: Hub = g.__pcHub ??= { version: new Map(), typing: new Map(), wired: false };

export const TYPING_MS = 6_000;

function wire() {
  if (hub.wired) return;
  hub.wired = true;
  onEvent("chat:bump", (d: { m: string; v: number }, remote) => { if (remote) hub.version.set(d.m, Math.max(d.v, hub.version.get(d.m) ?? 0)); });
  onEvent("chat:typing", (d: { m: string; u: string; until: number }, remote) => {
    if (!remote) return;
    const t = hub.typing.get(d.m) ?? new Map<string, number>();
    if (d.until) t.set(d.u, d.until); else t.delete(d.u);
    hub.typing.set(d.m, t);
  });
}

const vkey = (m: string) => `pc:chat:v:${m}`;

/** The conversation's current version (shared between servers when Redis is on). */
export async function chatVersion(matchId: string) {
  wire();
  const r = redis();
  if (r) {
    const v = Number(await r.get(vkey(matchId)).catch(() => null) ?? NaN);
    if (Number.isFinite(v)) hub.version.set(matchId, Math.max(v, hub.version.get(matchId) ?? 0));
  }
  return hub.version.get(matchId) ?? 0;
}

/** Something changed in this conversation (message sent, deleted, read). */
export function bumpChat(matchId: string) {
  wire();
  const r = redis();
  const announce = (v: number) => { hub.version.set(matchId, Math.max(v, hub.version.get(matchId) ?? 0)); emitEvent("chat:bump", { m: matchId, v }); emitEvent(`chat:${matchId}`); };
  if (!r) return announce((hub.version.get(matchId) ?? 0) + 1);
  void r.multi().incr(vkey(matchId)).expire(vkey(matchId), 7 * 86_400).exec()
    .then((res) => announce(Number(res?.[0]?.[1] ?? (hub.version.get(matchId) ?? 0) + 1)))
    .catch(() => announce((hub.version.get(matchId) ?? 0) + 1));
}

export function setTyping(matchId: string, userId: string, on: boolean, announce = true) {
  wire();
  const m = hub.typing.get(matchId) ?? new Map<string, number>();
  const until = on ? Date.now() + TYPING_MS : 0;
  if (on) m.set(userId, until); else m.delete(userId);
  hub.typing.set(matchId, m);
  // Other servers always learn the new state; waiters are only woken when asked to.
  emitEvent("chat:typing", { m: matchId, u: userId, until });
  if (announce) emitEvent(`chat:${matchId}`);
}

export function isTyping(matchId: string, userId: string) {
  const until = hub.typing.get(matchId)?.get(userId) ?? 0;
  return until > Date.now();
}

/**
 * Resolves as soon as the conversation's version differs from `since` or the other person's typing state
 * differs from `typingWas`, or after `timeoutMs`.
 */
export async function waitForChat(matchId: string, otherId: string, since: number, typingWas: boolean, timeoutMs: number, signal?: AbortSignal) {
  wire();
  const state = () => ({ version: hub.version.get(matchId) ?? 0, typing: isTyping(matchId, otherId) });
  await chatVersion(matchId);
  const now = state();
  if (now.version !== since || now.typing !== typingWas || timeoutMs <= 0) return now;
  return new Promise<{ version: number; typing: boolean }>((resolve) => {
    let done = false;
    const off = onEvent(`chat:${matchId}`, () => check());
    const finish = () => { if (done) return; done = true; off(); clearTimeout(t); clearTimeout(expire); resolve(state()); };
    const check = () => { const s = state(); if (s.version !== since || s.typing !== typingWas) finish(); };
    const t = setTimeout(finish, timeoutMs);
    // A typing indicator ends by itself: wake up when it would expire.
    const until = hub.typing.get(matchId)?.get(otherId) ?? 0;
    const expire = setTimeout(check, Math.max(0, Math.min(timeoutMs, until - Date.now() + 50)));
    signal?.addEventListener("abort", finish, { once: true });
  });
}
