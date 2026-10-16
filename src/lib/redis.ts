import "server-only";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import Redis from "ioredis";

// Optional Redis (REDIS_URL) for running more than one app server: shared rate limits, chat "something
// changed" signals, typing, and call setup. Without REDIS_URL everything stays in this process, which is
// right for a single server.
type State = { pub: Redis | null; sub: Redis | null; local: EventEmitter; id: string; ready: boolean };
const g = globalThis as unknown as { __pcRedis?: State };
const st: State = g.__pcRedis ??= { pub: null, sub: null, local: new EventEmitter().setMaxListeners(20_000), id: randomUUID(), ready: false };

const CHANNEL = "pc:events";

export function redis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!st.ready) {
    st.ready = true;
    const opts = { maxRetriesPerRequest: 2, enableOfflineQueue: true, lazyConnect: false };
    st.pub = new Redis(process.env.REDIS_URL, opts);
    st.sub = new Redis(process.env.REDIS_URL, opts);
    st.pub.on("error", (e) => console.warn("[redis]", e.message));
    st.sub.on("error", (e) => console.warn("[redis sub]", e.message));
    void st.sub.subscribe(CHANNEL);
    st.sub.on("message", (_ch, raw) => {
      try {
        const m = JSON.parse(raw) as { from: string; event: string; data: unknown };
        if (m.from !== st.id) st.local.emit(m.event, m.data, true);
      } catch { /* ignore malformed */ }
    });
  }
  return st.pub;
}

/** Listen for an event raised on this server or (with Redis) any other. */
export function onEvent(event: string, fn: (data: any, remote: boolean) => void) { st.local.on(event, fn); return () => { st.local.off(event, fn); }; }

/** Raise an event here and on every other server. */
export function emitEvent(event: string, data?: unknown) {
  st.local.emit(event, data, false);
  const r = redis();
  if (r) void r.publish(CHANNEL, JSON.stringify({ from: st.id, event, data })).catch(() => {});
}
