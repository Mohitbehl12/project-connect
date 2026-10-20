import "server-only";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

// Fraud & abuse risk. Signals carry weights; the unresolved total over 90 days sets LOW / MEDIUM / HIGH.
// HIGH asks for selfie verification and puts the account in the Admin → Risk queue for a person to review.
// Nothing here bans or suspends anyone by itself — a weak signal must never punish a real person.

export const RISK_KINDS = {
  SHARED_DEVICE: "Several accounts from one app install",
  SIGNUP_BURST: "Many sign-ups from one network in a short time",
  TRIAL_REUSE: "Tried to reuse an intro offer",
  REFERRAL_ABUSE: "Referral looks self-made",
  CHARGEBACK: "Payment disputed with the bank",
  PAYMENT_FAILURES: "Many failed payments in a row",
  MESSAGE_FLAGS: "Several messages flagged by safety screening",
  NEW_DEVICE_LOGIN: "Sign-in from a new device after failed attempts",
  GENDER_CHANGED: "Changed gender after sign-up (prices differ by gender)",
  CALL_REQUEST_SPAM: "Sent many call requests in a short time",
} as const;
export type RiskKind = keyof typeof RISK_KINDS;

export const RISK_THRESHOLDS = { MEDIUM: 30, HIGH: 60 };

export function levelFor(total: number): "LOW" | "MEDIUM" | "HIGH" {
  return total >= RISK_THRESHOLDS.HIGH ? "HIGH" : total >= RISK_THRESHOLDS.MEDIUM ? "MEDIUM" : "LOW";
}

export async function addRiskSignal(userId: string, kind: RiskKind, weight: number, detail?: string) {
  // One open signal per kind per day is enough — repeats shouldn't snowball a score.
  const since = new Date(Date.now() - 86_400_000);
  const dup = await db.query.riskSignals.findFirst({
    where: and(eq(schema.riskSignals.userId, userId), eq(schema.riskSignals.kind, kind), gte(schema.riskSignals.createdAt, since), isNull(schema.riskSignals.resolvedAt)),
  });
  if (!dup) await db.insert(schema.riskSignals).values({ userId, kind, weight, detail: detail?.slice(0, 300) });
  return recomputeRisk(userId);
}

export async function recomputeRisk(userId: string) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.riskSignals.weight}), 0)` })
    .from(schema.riskSignals)
    .where(and(eq(schema.riskSignals.userId, userId), gte(schema.riskSignals.createdAt, since), isNull(schema.riskSignals.resolvedAt)));
  const level = levelFor(Number(row?.total ?? 0));
  await db.update(schema.users).set({ riskLevel: level }).where(eq(schema.users.id, userId));
  return level;
}
