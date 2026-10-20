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
  "chat.mediaAfterMessagesEach": 1, // photos and voice messages unlock once both people have sent this many messages
  "chat.kindnessCheck": true, // ask "send anyway?" before a message that looks hurtful
  "calls.enabled": true, // voice and video calls between matches (also needs a TURN relay in production; see docs/CALLS.md)
  "calls.minMessagesEach": 1, // both people must have sent at least this many messages before either can call
  "discovery.batchSize": 20,
  "safety.autoSuspendReportThreshold": 5, // distinct reporters within 30 days → auto-suspend pending review
  // Billing
  "billing.genderPricingCountries": ["IN"] as string[], // gender price groups / offers apply only here
  "billing.reminderDays": 2, // renewal reminder this many days before each charge
  "billing.graceDays": 3, // keep access this long after a failed renewal while the gateway retries
  "billing.seller": { name: "Kinara (placeholder legal entity)", address: "Address to be added", gstin: "", email: "billing@example.com", gstRatePct: 18 },
  // Referrals and rewards
  "referral.rewardDays": 7,
  "referral.monthlyCap": 10, // rewards one person can earn per calendar month
  "rewards.completeProfileBoostMinutes": 30, // one-time boost for reaching 100% profile
  "rewards.womenFreeForever": true, // women & everyone not a man, in gender-pricing countries: every plan free for life
  "rewards.menTrialDays": 15, // men in gender-pricing countries: free trial on finishing sign-up (0 = off); nothing is charged automatically
  "rewards.verifiedPremiumDays": 0, // optional Premium days for completing selfie verification
  // Data retention
  "retention.deletedMessageDays": 90, // deleted messages are kept this long for safety review, then purged
  "retention.loginEventDays": 180,
  // Photo checks before anyone else sees a photo: "auto" (scanner, else staff review) | "review" | "off" (testing).
  "moderation.photoScreening": "auto" as "auto" | "review" | "off",
  // Last database backup (written by the backup job, shown in Admin → Settings).
  "ops.lastBackup": { at: null, key: null, bytes: 0, error: null } as { at: string | null; key: string | null; bytes: number; error: string | null; failedAt?: string },
  // Published contacts (Contact page, Grievance page, app). Empty officer name = shown as "being appointed".
  "legal.contacts": {
    companyName: "", supportEmail: "", safetyEmail: "", privacyEmail: "",
    grievanceOfficer: { name: "", designation: "Grievance Officer", email: "", phone: "", address: "" },
  } as { companyName: string; supportEmail: string; safetyEmail: string; privacyEmail: string; grievanceOfficer: { name: string; designation: string; email: string; phone: string; address: string } },
};
export type ConfigKey = keyof typeof CONFIG_DEFAULTS;

export async function getConfig<K extends ConfigKey>(key: K): Promise<(typeof CONFIG_DEFAULTS)[K]> {
  const row = await db.query.appConfig.findFirst({ where: eq(schema.appConfig.key, key) });
  if (!row) return CONFIG_DEFAULTS[key];
  try {
    const parsed = JSON.parse(row.value);
    if (typeof CONFIG_DEFAULTS[key] === "object" && !Array.isArray(CONFIG_DEFAULTS[key])) return { ...(CONFIG_DEFAULTS[key] as object), ...parsed };
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
