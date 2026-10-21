import { and, count, desc, eq, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import { AD_CATEGORIES, CTAS, campaignStats, parseCreative, parseTargeting } from "@/lib/ads";
import { ok, route } from "@/lib/http";
import { storage } from "@/lib/storage";

/** Ads overview for staff: review queue, campaigns, advertisers, reports, refunds, revenue. */
export const GET = route(async () => {
  const campaigns = await db.select({ c: schema.adCampaigns, a: schema.advertisers }).from(schema.adCampaigns).innerJoin(schema.advertisers, eq(schema.advertisers.id, schema.adCampaigns.advertiserId)).orderBy(desc(schema.adCampaigns.updatedAt)).limit(300);
  const advertisers = await db.select().from(schema.advertisers).orderBy(desc(schema.advertisers.createdAt)).limit(300);
  const reports = await db.select({ r: schema.adReports, name: schema.adCampaigns.name }).from(schema.adReports).innerJoin(schema.adCampaigns, eq(schema.adCampaigns.id, schema.adReports.campaignId)).orderBy(desc(schema.adReports.createdAt)).limit(200);
  const refunds = await db.select({ t: schema.adTransactions, name: schema.advertisers.businessName }).from(schema.adTransactions).innerJoin(schema.advertisers, eq(schema.advertisers.id, schema.adTransactions.advertiserId)).where(eq(schema.adTransactions.kind, "REFUND")).orderBy(desc(schema.adTransactions.createdAt)).limit(100);
  const [{ topups }] = await db.select({ topups: sum(schema.adTransactions.amountMinor) }).from(schema.adTransactions).where(and(eq(schema.adTransactions.status, "PAID"), eq(schema.adTransactions.kind, "TOPUP")));
  const [{ spend }] = await db.select({ spend: sum(schema.adCampaigns.spentMinor) }).from(schema.adCampaigns);
  const [{ open }] = await db.select({ open: count() }).from(schema.adReports).where(eq(schema.adReports.status, "OPEN"));
  const stats = await campaignStats(campaigns.map((x) => x.c.id), 30);
  const pending = await Promise.all(campaigns.filter((x) => x.c.status === "PENDING_REVIEW").map(async ({ c, a }) => {
    const cr = parseCreative(c.creative);
    return { ...c, advertiser: { ...a, categoryLabel: AD_CATEGORIES[a.category as keyof typeof AD_CATEGORIES] ?? a.category }, ctaLabel: CTAS[cr.cta as keyof typeof CTAS] ?? "Learn more", creative: cr, targeting: parseTargeting(c.targeting), images: await Promise.all(cr.imageKeys.map((k) => storage().url(k, 3600))), video: cr.videoKey ? await storage().url(cr.videoKey, 3600) : null, logo: cr.logoKey ? await storage().url(cr.logoKey, 3600) : null };
  }));
  return ok({
    totals: { advertisers: advertisers.length, campaigns: campaigns.length, active: campaigns.filter((x) => x.c.status === "ACTIVE").length, pending: pending.length, rejected: campaigns.filter((x) => x.c.status === "REJECTED").length, revenueMinor: Number(spend ?? 0), topupsMinor: Number(topups ?? 0), openReports: open, ...stats.totals },
    pending, categories: AD_CATEGORIES,
    campaigns: campaigns.map(({ c, a }) => ({ id: c.id, name: c.name, status: c.status, pricing: c.pricing, placements: c.placements, spentMinor: c.spentMinor, advertiser: a.businessName, advertiserId: a.id, autoFlags: c.autoFlags, updatedAt: c.updatedAt })),
    advertisers: advertisers.map((a) => ({ ...a, categoryLabel: AD_CATEGORIES[a.category as keyof typeof AD_CATEGORIES] ?? a.category })),
    reports: reports.map((x) => ({ ...x.r, campaignName: x.name })),
    refunds: refunds.map((x) => ({ ...x.t, businessName: x.name })),
  });
}, { permission: "ads.review" });
