import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_WEIGHTS, type Weights } from "./matching";

export type PlanFeatures = {
  dailyLikes: number; // -1 = unlimited
  dailyPriorityLikes: number;
  seeWhoLiked: boolean;
  advancedFilters: boolean;
  incognito: boolean;
  travelMode: boolean;
  monthlyBoosts: number;
};

export const CONFIG_DEFAULTS = {
  "matching.weights": DEFAULT_WEIGHTS as Weights,
  "chat.maxUnansweredMessages": 4, // messages a person can send before the other replies
  "discovery.batchSize": 20,
  "safety.autoSuspendReportThreshold": 5, // distinct reporters within 30 days → auto-suspend pending review
};
export type ConfigKey = keyof typeof CONFIG_DEFAULTS;

export async function getConfig<K extends ConfigKey>(key: K): Promise<(typeof CONFIG_DEFAULTS)[K]> {
  const row = await db.query.appConfig.findFirst({ where: eq(schema.appConfig.key, key) });
  if (!row) return CONFIG_DEFAULTS[key];
  try {
    const parsed = JSON.parse(row.value);
    if (typeof CONFIG_DEFAULTS[key] === "object") return { ...(CONFIG_DEFAULTS[key] as object), ...parsed };
    return parsed;
  } catch {
    return CONFIG_DEFAULTS[key];
  }
}

export async function setConfig(key: ConfigKey, value: unknown, updatedBy: string) {
  const v = JSON.stringify(value);
  await db.insert(schema.appConfig).values({ key, value: v, updatedBy })
    .onConflictDoUpdate({ target: schema.appConfig.key, set: { value: v, updatedBy, updatedAt: new Date() } });
}

const FREE_FEATURES: PlanFeatures = {
  dailyLikes: 25, dailyPriorityLikes: 1, seeWhoLiked: false, advancedFilters: false,
  incognito: false, travelMode: false, monthlyBoosts: 0,
};

/** Entitlements for a user's current plan (falls back to FREE if the plan expired or is missing). */
export async function planFeatures(planCode: string, planEndsAt: Date | null): Promise<PlanFeatures> {
  const effective = planCode !== "FREE" && planEndsAt && planEndsAt.getTime() > Date.now() ? planCode : "FREE";
  const plan = await db.query.plans.findFirst({ where: eq(schema.plans.code, effective) });
  if (!plan) return FREE_FEATURES;
  try {
    return { ...FREE_FEATURES, ...JSON.parse(plan.features) };
  } catch {
    return FREE_FEATURES;
  }
}
