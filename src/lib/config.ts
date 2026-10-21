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
  "chat.massMessagingMatches": 15, // new chats started within 10 minutes before we ask the person to slow down (0 = off)
  // Staff security
  "admin.idleTimeoutMinutes": 30, // staff must re-enter their 2-step code after this long without admin activity
  "admin.sensitiveViewsPerHourAlert": 60, // a staff member opening more private records than this in an hour alerts super admins
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
  "retention.endedChatDays": 90, // messages in ended chats (unmatched, blocked, deleted account) — unless reported or on legal hold
  "retention.reportedChatDays": 365, // evidence in reported chats, counted from the chat ending
  "retention.closedReportDays": 730, // closed reports: free-text details removed after this; category/outcome kept
  "retention.callMetadataDays": 180, // who called whom, when, how long (never audio or video — calls aren't recorded)
  "retention.callRequestDays": 90,
  "retention.notificationDays": 90,
  "retention.resolvedRiskSignalDays": 365,
  "retention.automatedDecisionDays": 730,
  "retention.auditLogDays": 1095, // security and admin audit trail (3 years)
  "retention.inactiveAccountMonths": 0, // 0 = off. When set, accounts unused this long are warned, then deleted 30 days later
  // Photo checks before anyone else sees a photo: "auto" (scanner, else staff review) | "review" | "off" (testing).
  "moderation.photoScreening": "auto" as "auto" | "review" | "off",
  // Last database backup (written by the backup job, shown in Admin → Settings).
  "ops.lastBackup": { at: null, key: null, bytes: 0, error: null } as { at: string | null; key: string | null; bytes: number; error: string | null; failedAt?: string },
  // Country rules (src/lib/compliance.ts has the starting values); only overrides are stored here.
  "compliance.countries": {} as Record<string, Partial<import("./compliance").CountryRules>>,
  // Data processing agreement status per service provider (src/lib/vendors.ts).
  "vendors.status": {} as Record<string, { dpa: "NOT_STARTED" | "IN_PROGRESS" | "SIGNED" | "NOT_NEEDED"; notes: string }>,
  // Launch checklist (Admin → Launch readiness): item id → sign-off.
  "launch.checklist": {} as Record<string, { status: "OPEN" | "DONE" | "NOT_APPLICABLE"; by: string; at: string; note: string }>,
  // Published contacts (Contact page, Grievance page, app). Empty officer name = shown as "being appointed".
  "legal.contacts": {
    companyName: "", supportEmail: "", safetyEmail: "", privacyEmail: "", registeredAddress: "", courtsCity: "",
    grievanceOfficer: { name: "", designation: "Grievance Officer", email: "", phone: "", address: "" },
  } as { companyName: string; supportEmail: string; safetyEmail: string; privacyEmail: string; registeredAddress?: string; courtsCity?: string; grievanceOfficer: { name: string; designation: string; email: string; phone: string; address: string } },
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
