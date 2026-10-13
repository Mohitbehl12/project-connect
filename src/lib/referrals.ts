import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "./audit";
import { grantPremiumDays } from "./billing";
import { getConfig } from "./config";
import { notify } from "./notify";
import { appUrl } from "./paytoken";
import { addRiskSignal } from "./risk";

// Invite & earn: a friend joins with your code → completes selfie verification → you get Premium days.
// Fraud checks run at reward time, when we know most: same app install = rejected; same network or a
// high-risk friend = held for a person to review; a monthly cap limits farming. Never cash, only days.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export async function referralCodeFor(user: User) {
  if (user.referralCode) return user.referralCode;
  for (let i = 0; i < 5; i++) {
    const code = Array.from(randomBytes(7), (b) => ALPHABET[b % ALPHABET.length]).join("");
    const taken = await db.query.users.findFirst({ where: eq(schema.users.referralCode, code) });
    if (taken) continue;
    await db.update(schema.users).set({ referralCode: code }).where(eq(schema.users.id, user.id));
    return code;
  }
  throw new Error("could not allocate referral code");
}

/** At sign-up: link the new account to whoever invited them (silently ignores bad codes). */
export async function attachReferral(newUser: User, code: string | undefined | null) {
  if (!code) return;
  const referrer = await db.query.users.findFirst({ where: eq(schema.users.referralCode, code.trim().toUpperCase()) });
  if (!referrer || referrer.id === newUser.id || referrer.status !== "ACTIVE") return;
  await db.update(schema.users).set({ referredById: referrer.id }).where(eq(schema.users.id, newUser.id));
  await db.insert(schema.referrals).values({ referrerId: referrer.id, refereeId: newUser.id }).onConflictDoNothing();
}

/** Called when someone's selfie verification is approved. */
export async function onVerified(userId: string) {
  const verifiedDays = await getConfig("rewards.verifiedPremiumDays");
  if (verifiedDays > 0) await grantPremiumDays(userId, verifiedDays, "verified-reward");

  const ref = await db.query.referrals.findFirst({ where: and(eq(schema.referrals.refereeId, userId), eq(schema.referrals.status, "PENDING")) });
  if (!ref) return null;
  const [referrer, referee] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, ref.referrerId) }),
    db.query.users.findFirst({ where: eq(schema.users.id, ref.refereeId) }),
  ]);
  if (!referrer || !referee) return null;
  const decide = async (status: "REWARDED" | "REJECTED" | "HELD", reason: string, rewardDays?: number) => {
    await db.update(schema.referrals).set({ status, reason, rewardDays: rewardDays ?? null, decidedAt: new Date() }).where(eq(schema.referrals.id, ref.id));
    await audit(null, `referral.${status.toLowerCase()}`, "referral", ref.id, { reason });
    return status;
  };

  if (referee.signupInstallId && referee.signupInstallId === referrer.signupInstallId) {
    await addRiskSignal(referrer.id, "REFERRAL_ABUSE", 25, "Referred account created on the same app install");
    return decide("REJECTED", "Created on the same device as the inviter");
  }
  if (referee.riskLevel === "HIGH") return decide("HELD", "Friend's account needs a safety review");
  if (referee.signupIp && referee.signupIp === referrer.signupIp) return decide("HELD", "Joined from the same network as the inviter");
  return rewardReferral(ref.id, referrer.id, decide);
}

async function rewardReferral(refId: string, referrerId: string, decide: (s: "REWARDED" | "REJECTED" | "HELD", r: string, d?: number) => Promise<string>) {
  const cap = await getConfig("referral.monthlyCap");
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(schema.referrals)
    .where(and(eq(schema.referrals.referrerId, referrerId), eq(schema.referrals.status, "REWARDED"), gte(schema.referrals.decidedAt, monthStart)));
  if (Number(row?.n ?? 0) >= cap) return decide("REJECTED", "Monthly reward limit reached");
  const days = await getConfig("referral.rewardDays");
  await grantPremiumDays(referrerId, days, "referral");
  await notify(referrerId, "SUBSCRIPTION", "Your friend joined 💜", `They're verified, so you've earned ${days} Premium days.`, "/referrals");
  return decide("REWARDED", "Friend verified", days);
}

/** Admin: release a held referral (reward it) or reject it. */
export async function resolveHeldReferral(staffId: string, refId: string, approve: boolean) {
  const ref = await db.query.referrals.findFirst({ where: eq(schema.referrals.id, refId) });
  if (!ref || ref.status !== "HELD") return null;
  const decide = async (status: "REWARDED" | "REJECTED" | "HELD", reason: string, rewardDays?: number) => {
    await db.update(schema.referrals).set({ status, reason, rewardDays: rewardDays ?? null, decidedAt: new Date() }).where(eq(schema.referrals.id, ref.id));
    await audit(staffId, `referral.${status.toLowerCase()}`, "referral", ref.id, { reason, manual: true });
    return status;
  };
  return approve ? rewardReferral(ref.id, ref.referrerId, decide) : decide("REJECTED", "Rejected after review");
}

export async function referralOverview(user: User) {
  const code = await referralCodeFor(user);
  const rows = await db.select({ r: schema.referrals, name: schema.profiles.firstName })
    .from(schema.referrals).leftJoin(schema.profiles, eq(schema.profiles.userId, schema.referrals.refereeId))
    .where(eq(schema.referrals.referrerId, user.id)).orderBy(desc(schema.referrals.createdAt)).limit(50);
  const days = await getConfig("referral.rewardDays");
  return {
    code,
    link: `${appUrl()}/join?ref=${code}`,
    rewardDays: days,
    monthlyCap: await getConfig("referral.monthlyCap"),
    earnedDays: rows.filter((x) => x.r.status === "REWARDED").reduce((a, x) => a + (x.r.rewardDays ?? 0), 0),
    history: rows.map(({ r, name }) => ({
      id: r.id, name: name ?? "A friend", joinedAt: r.createdAt, status: r.status,
      label: { PENDING: "Joined — waiting for verification", REWARDED: `Verified — you earned ${r.rewardDays} days`, HELD: "Under review", REJECTED: "Not eligible" }[r.status] ?? r.status,
    })),
  };
}
