import { and, count, eq, gte, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

export const GET = route(async () => {
  const day = new Date(Date.now() - 86400_000);
  const week = new Date(Date.now() - 7 * 86400_000);
  const month = new Date(Date.now() - 30 * 86400_000);
  const U = schema.users;
  const isUser = eq(U.role, "USER");
  const c = async (q: Promise<{ n: number }[]>) => (await q)[0].n;

  const [total, active24h, active7d, new7d, verified, pendingVerification, premium, suspended, banned,
    matches, matches7d, messages7d, openReports, criticalReports, blocks] = await Promise.all([
    c(db.select({ n: count() }).from(U).where(isUser)),
    c(db.select({ n: count() }).from(U).where(and(isUser, gte(U.lastActiveAt, day)))),
    c(db.select({ n: count() }).from(U).where(and(isUser, gte(U.lastActiveAt, week)))),
    c(db.select({ n: count() }).from(U).where(and(isUser, gte(U.createdAt, week)))),
    c(db.select({ n: count() }).from(U).where(and(isUser, eq(U.selfieStatus, "VERIFIED")))),
    c(db.select({ n: count() }).from(U).where(and(isUser, eq(U.selfieStatus, "PENDING")))),
    c(db.select({ n: count() }).from(U).where(and(isUser, sql`${U.planCode} != 'FREE'`, gte(U.planEndsAt, new Date())))),
    c(db.select({ n: count() }).from(U).where(eq(U.status, "SUSPENDED"))),
    c(db.select({ n: count() }).from(U).where(eq(U.status, "BANNED"))),
    c(db.select({ n: count() }).from(schema.matches)),
    c(db.select({ n: count() }).from(schema.matches).where(gte(schema.matches.createdAt, week))),
    c(db.select({ n: count() }).from(schema.messages).where(gte(schema.messages.createdAt, week))),
    c(db.select({ n: count() }).from(schema.reports).where(eq(schema.reports.status, "OPEN"))),
    c(db.select({ n: count() }).from(schema.reports).where(and(eq(schema.reports.status, "OPEN"), eq(schema.reports.priority, "CRITICAL")))),
    c(db.select({ n: count() }).from(schema.blocks)),
  ]);

  const revenue = await db.select({ currency: schema.subscriptions.currency, total: sum(schema.subscriptions.amountMinor) })
    .from(schema.subscriptions).where(gte(schema.subscriptions.startedAt, month)).groupBy(schema.subscriptions.currency);
  const byCountry = await db.select({ country: schema.profiles.country, n: count() }).from(schema.profiles)
    .innerJoin(U, eq(U.id, schema.profiles.userId)).where(isUser).groupBy(schema.profiles.country).orderBy(sql`count(*) desc`);
  const byPlan = await db.select({ plan: U.planCode, n: count() }).from(U).where(isUser).groupBy(U.planCode);

  // Daily signups and matches for the last 14 days.
  const since = new Date(Date.now() - 14 * 86400_000);
  const signups = await db.select({ d: sql<string>`date(${U.createdAt} / 1000, 'unixepoch')`, n: count() })
    .from(U).where(and(isUser, gte(U.createdAt, since))).groupBy(sql`1`);
  const matchDays = await db.select({ d: sql<string>`date(${schema.matches.createdAt} / 1000, 'unixepoch')`, n: count() })
    .from(schema.matches).where(gte(schema.matches.createdAt, since)).groupBy(sql`1`);

  return ok({
    users: { total, active24h, active7d, new7d, verified, pendingVerification, premium, suspended, banned },
    engagement: { matches, matches7d, messages7d, blocks },
    safety: { openReports, criticalReports },
    revenue30d: revenue.map((r) => ({ currency: r.currency, amountMinor: Number(r.total ?? 0) })),
    byCountry, byPlan,
    daily: { signups, matches: matchDays },
    // 7-day retention proxy: share of users created >7d ago who were active in the last 7 days.
    retention7d: total ? Math.round((active7d / Math.max(1, total)) * 100) : 0,
  });
}, { permission: "analytics.view" });
