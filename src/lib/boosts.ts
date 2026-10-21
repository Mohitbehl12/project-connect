import "server-only";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "./audit";
import { planFeatures } from "./config";
import { ApiError } from "./http";

export const BOOST_MINUTES = 30;
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };

/** Boosts left this month on the member's plan, and any boost running now. */
export async function boostStatus(user: User) {
  const f = await planFeatures(user.planCode, user.planEndsAt);
  const [{ n }] = await db.select({ n: count() }).from(schema.boosts).where(and(eq(schema.boosts.userId, user.id), gte(schema.boosts.startedAt, monthStart())));
  const last = await db.query.boosts.findFirst({ where: eq(schema.boosts.userId, user.id), orderBy: desc(schema.boosts.startedAt) });
  const activeUntil = last && last.endsAt > new Date() ? last.endsAt : null;
  return { perMonth: f.monthlyBoosts, used: n, left: Math.max(0, f.monthlyBoosts - n), activeUntil, minutes: BOOST_MINUTES };
}

/** Starts a 30-minute boost: shown higher in Discover. Honest effect — it changes order, not who can see you. */
export async function startBoost(user: User) {
  const s = await boostStatus(user);
  if (s.activeUntil) throw new ApiError(409, "Your boost is already running.", "boost_active");
  if (s.perMonth <= 0) throw new ApiError(402, "Boosts are part of Premium.", "upgrade_required");
  if (s.left <= 0) throw new ApiError(429, "You've used this month's boosts. They refresh on the 1st.", "no_boosts_left");
  const endsAt = new Date(Date.now() + BOOST_MINUTES * 60_000);
  await db.insert(schema.boosts).values({ userId: user.id, endsAt });
  await db.update(schema.users).set({ boostUntil: endsAt }).where(eq(schema.users.id, user.id));
  await audit(user.id, "boost.start", "user", user.id);
  return boostStatus({ ...user });
}
