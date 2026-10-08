import { ApiError } from "./http";

// Fixed-window in-memory limiter. Good for a single instance / dev.
// Production with multiple instances: back this with Redis/Upstash (same interface).
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) {
    const secs = Math.ceil((b.resetAt - now) / 1000);
    throw new ApiError(429, `Too many attempts. Try again in ${secs} seconds.`, "rate_limited");
  }
}

export function resetRateLimits() {
  buckets.clear();
}
