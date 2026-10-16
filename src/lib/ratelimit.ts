import { ApiError } from "./http";
import { redis } from "./redis";

// Fixed-window limiter. Shared across servers through Redis when REDIS_URL is set; otherwise in memory.
const buckets = new Map<string, { count: number; resetAt: number }>();

const tooMany = (ms: number) => new ApiError(429, `Too many attempts. Try again in ${Math.max(1, Math.ceil(ms / 1000))} seconds.`, "rate_limited");

export async function rateLimit(key: string, limit: number, windowMs: number) {
  const r = redis();
  if (r) {
    try {
      const k = `pc:rl:${key}`;
      const [[, n], [, ttl]] = (await r.multi().incr(k).pttl(k).exec()) as [[null, number], [null, number]];
      if (ttl < 0) await r.pexpire(k, windowMs);
      if (n > limit) throw tooMany(ttl > 0 ? ttl : windowMs);
      return;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // Redis unreachable: fall back to this server's own count rather than blocking everyone.
    }
  }
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return; }
  b.count++;
  if (b.count > limit) throw tooMany(b.resetAt - now);
}

export function resetRateLimits() {
  buckets.clear();
}
