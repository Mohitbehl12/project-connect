import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

const DAY = 86_400_000;

/**
 * Revenue and subscription metrics. Amounts are net of refunds and grouped by currency (never summed
 * across currencies). Trial-to-paid = intro subscriptions whose intro has ended and that renewed.
 */
export const GET = route(async () => {
  const now = Date.now();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(startOfDay); startOfMonth.setDate(1);
  const P = schema.payments, S = schema.subscriptions;
  const captured = inArray(P.status, ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"]);
  const net = sql<number>`coalesce(sum(${P.amountMinor} - ${P.refundedMinor}), 0)`;

  const sumBy = (since: Date | null) => db.select({ currency: P.currency, amountMinor: net, n: sql<number>`count(*)` }).from(P)
    .where(and(captured, since ? gte(P.paidAt, since) : undefined)).groupBy(P.currency);

  const [total, today, month, byPlan, byCountry, byCampaign, daily, failed, refunds, disputes, coupons, subs, introEnded, introRenewed] = await Promise.all([
    sumBy(null), sumBy(startOfDay), sumBy(startOfMonth),
    db.select({ plan: P.planCode, currency: P.currency, amountMinor: net, n: sql<number>`count(*)` }).from(P).where(and(captured, gte(P.paidAt, new Date(now - 30 * DAY)))).groupBy(P.planCode, P.currency),
    db.select({ country: schema.profiles.country, currency: P.currency, amountMinor: net }).from(P).leftJoin(schema.profiles, eq(schema.profiles.userId, P.userId))
      .where(and(captured, gte(P.paidAt, new Date(now - 30 * DAY)))).groupBy(schema.profiles.country, P.currency),
    db.select({ offer: schema.offers.name, coupon: P.couponCode, currency: P.currency, amountMinor: net, n: sql<number>`count(*)` }).from(P).leftJoin(schema.offers, eq(schema.offers.id, P.offerId))
      .where(and(captured, gte(P.paidAt, new Date(now - 30 * DAY)))).groupBy(schema.offers.name, P.couponCode, P.currency),
    db.select({ d: sql<string>`strftime('%Y-%m-%d', ${P.paidAt} / 1000, 'unixepoch', '+5 hours', '+30 minutes')`, currency: P.currency, amountMinor: net, n: sql<number>`count(*)` }).from(P)
      .where(and(captured, gte(P.paidAt, new Date(now - 30 * DAY)))).groupBy(sql`1`, P.currency),
    db.select({ n: sql<number>`count(*)` }).from(P).where(and(eq(P.status, "FAILED"), gte(P.createdAt, new Date(now - 30 * DAY)))),
    db.select({ currency: P.currency, amountMinor: sql<number>`coalesce(sum(${P.refundedMinor}), 0)`, n: sql<number>`count(*)` }).from(P).where(sql`${P.refundedMinor} > 0`).groupBy(P.currency),
    db.select({ n: sql<number>`count(*)` }).from(P).where(eq(P.disputed, true)),
    db.select({ code: P.couponCode, n: sql<number>`count(*)` }).from(P).where(and(captured, isNotNull(P.couponCode))).groupBy(P.couponCode),
    db.select({ status: S.status, n: sql<number>`count(*)` }).from(S).where(sql`${S.provider} != 'REWARD'`).groupBy(S.status),
    db.select({ n: sql<number>`count(*)` }).from(S).where(and(isNotNull(S.offerId), sql`${S.startedAt} < ${now - 1}`, inArray(S.status, ["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"]),
      sql`exists (select 1 from offers o where o.id = ${S.offerId} and o.kind = 'INTRO')`, sql`exists (select 1 from payments p where p.subscription_id = ${S.id} and p.status != 'CREATED')`)),
    db.select({ n: sql<number>`count(distinct ${P.subscriptionId})` }).from(P).innerJoin(S, eq(S.id, P.subscriptionId))
      .where(and(eq(P.purpose, "RENEWAL"), inArray(P.status, ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"]), sql`exists (select 1 from offers o where o.id = ${S.offerId} and o.kind = 'INTRO')`)),
  ]);
  const count = (st: string) => Number(subs.find((x) => x.status === st)?.n ?? 0);
  const newSubs = await db.select({ n: sql<number>`count(*)` }).from(P).where(and(captured, inArray(P.purpose, ["INITIAL", "PASS"]), gte(P.paidAt, new Date(now - 30 * DAY))));
  const ended = Number(introEnded[0]?.n ?? 0), renewed = Number(introRenewed[0]?.n ?? 0);
  return ok({
    revenue: { total, today, month },
    active: count("ACTIVE") + count("PAST_DUE") + count("CANCELLED"),
    trialing: count("TRIALING"),
    pastDue: count("PAST_DUE"),
    newSubscriptions30d: Number(newSubs[0]?.n ?? 0),
    trialToPaid: { endedIntros: ended, renewed, rate: ended ? Math.round((renewed / ended) * 100) : null },
    failedPayments30d: Number(failed[0]?.n ?? 0),
    refunds,
    chargebacks: Number(disputes[0]?.n ?? 0),
    couponsUsed: coupons,
    byPlan, byCountry, byCampaign, daily,
  });
}, { permission: "payments.view" });
