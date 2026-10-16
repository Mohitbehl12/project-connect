import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { CONFIG_DEFAULTS, getConfig, setConfig } from "@/lib/config";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";


export const GET = route(async () => {
  const plans = await db.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder));
  const prices = await db.select().from(schema.planPrices);
  const config: Record<string, unknown> = {};
  for (const k of Object.keys(CONFIG_DEFAULTS) as (keyof typeof CONFIG_DEFAULTS)[]) config[k] = await getConfig(k);
  return ok({
    config,
    plans: plans.map((p) => ({ ...p, features: JSON.parse(p.features), prices: prices.filter((x) => x.planId === p.id) })),
  });
}, { permission: "admin.access" });

const W = z.number().min(0).max(100);
const Body = z.object({
  config: z.object({
    "matching.weights": z.object({ intent: W, interests: W, personality: W, lifestyle: W, distance: W, age: W, quality: W }).optional(),
    "chat.maxUnansweredMessages": z.number().int().min(1).max(50).optional(),
    "calls.enabled": z.boolean().optional(),
    "calls.minMessagesEach": z.number().int().min(0).max(50).optional(),
    "discovery.batchSize": z.number().int().min(5).max(100).optional(),
    "safety.autoSuspendReportThreshold": z.number().int().min(2).max(100).optional(),
    "billing.genderPricingCountries": z.array(z.string().regex(/^[A-Z]{2}$/)).max(50).optional(),
    "billing.reminderDays": z.number().int().min(1).max(14).optional(),
    "billing.graceDays": z.number().int().min(0).max(14).optional(),
    "billing.seller": z.object({ name: z.string().max(120), address: z.string().max(300), gstin: z.string().max(20), email: z.string().max(120), gstRatePct: z.number().min(0).max(40) }).optional(),
    "referral.rewardDays": z.number().int().min(0).max(90).optional(),
    "referral.monthlyCap": z.number().int().min(0).max(100).optional(),
    "rewards.completeProfileBoostMinutes": z.number().int().min(0).max(1440).optional(),
    "rewards.womenFreeDays": z.number().int().min(0).max(365).optional(),
    "rewards.verifiedPremiumDays": z.number().int().min(0).max(90).optional(),
    "retention.deletedMessageDays": z.number().int().min(7).max(3650).optional(),
    "retention.loginEventDays": z.number().int().min(30).max(3650).optional(),
    "moderation.photoScreening": z.enum(["auto", "review", "off"]).optional(),
    "legal.contacts": z.object({
      companyName: z.string().max(120), supportEmail: z.string().max(120), safetyEmail: z.string().max(120), privacyEmail: z.string().max(120),
      grievanceOfficer: z.object({ name: z.string().max(80), designation: z.string().max(80), email: z.string().max(120), phone: z.string().max(30), address: z.string().max(300) }),
    }).optional(),
  }).optional(),
  plans: z.array(z.object({
    id: z.string(),
    name: z.string().trim().min(1).max(40).optional(),
    active: z.boolean().optional(),
    features: z.object({
      dailyLikes: z.number().int().min(-1), dailyPriorityLikes: z.number().int().min(0), seeWhoLiked: z.boolean(),
      advancedFilters: z.boolean(), incognito: z.boolean(), travelMode: z.boolean(), monthlyBoosts: z.number().int().min(0),
    }).optional(),
    prices: z.array(z.object({
      id: z.string().optional(), country: z.string().regex(/^([A-Z]{2}|\*)$/), currency: z.string().regex(/^[A-Z]{3}$/),
      amountMinor: z.number().int().min(0), promoMinor: z.number().int().min(0).nullable().optional(),
      durationDays: z.number().int().min(1).max(366), active: z.boolean().default(true),
      segment: z.string().regex(/^(\*|gender:(MAN|WOMAN|NONBINARY))$/).default("*"),
      appleProductId: z.string().regex(/^[A-Za-z0-9._]{1,100}$/).nullable().optional(),
      googleProductId: z.string().regex(/^[a-z0-9][a-z0-9._]{0,99}$/).nullable().optional(),
    })).optional(),
  })).optional(),
});

export const PUT = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  if (b.config) {
    if (!can(user.role, "config.edit")) throw new ApiError(403, "You don't have permission to change settings.", "forbidden");
    for (const [k, v] of Object.entries(b.config)) {
      if (v === undefined) continue;
      const before = await getConfig(k as keyof typeof CONFIG_DEFAULTS);
      await setConfig(k as keyof typeof CONFIG_DEFAULTS, v, user.id);
      await audit(user.id, "config.update", "config", k, { before, after: v });
    }
  }
  if (b.plans) {
    if (!can(user.role, "plans.edit")) throw new ApiError(403, "You don't have permission to change plans.", "forbidden");
    for (const p of b.plans) {
      const set: Record<string, unknown> = {};
      if (p.name) set.name = p.name;
      if (p.active !== undefined) set.active = p.active;
      if (p.features) set.features = JSON.stringify(p.features);
      if (Object.keys(set).length) await db.update(schema.plans).set(set).where(eq(schema.plans.id, p.id));
      for (const pr of p.prices ?? []) {
        const vals = { country: pr.country, currency: pr.currency, amountMinor: pr.amountMinor, promoMinor: pr.promoMinor ?? null, durationDays: pr.durationDays, active: pr.active, segment: pr.segment,
          ...(pr.appleProductId !== undefined ? { appleProductId: pr.appleProductId || null } : {}), ...(pr.googleProductId !== undefined ? { googleProductId: pr.googleProductId || null } : {}) };
        // A changed amount needs a new gateway plan; existing subscribers keep their price until they change plan.
        if (pr.id) {
          const before = await db.query.planPrices.findFirst({ where: eq(schema.planPrices.id, pr.id) });
          if (before && (before.amountMinor !== pr.amountMinor || before.durationDays !== pr.durationDays)) Object.assign(vals, { providerPlanId: null });
        }
        if (pr.id) await db.update(schema.planPrices).set(vals).where(eq(schema.planPrices.id, pr.id));
        else await db.insert(schema.planPrices).values({ planId: p.id, ...vals });
      }
      await audit(user.id, "plans.update", "plan", p.id, p);
    }
  }
  return ok({ saved: true });
}, { permission: "admin.access" });
