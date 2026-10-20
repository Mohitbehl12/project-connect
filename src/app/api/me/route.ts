import { deleteAccount } from "@/lib/privacy";
import { z } from "zod";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { planFeatures } from "@/lib/config";
import { pendingLegal } from "@/lib/legal";
import { ROLE_PERMISSIONS } from "@/lib/rbac";
import type { Role } from "@/lib/constants";
import { destroySession, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { grantStartingMembership, membershipStatus } from "@/lib/billing";

/** The signed-in user's own data. This is the only endpoint that returns private fields, and only to their owner. */
export const GET = route(async ({ user }) => {
  // Moves existing members onto the current membership rules (free forever / free trial). Cheap when nothing to do.
  if (user.onboardingStep >= 3 && user.planCode !== "VIP") await grantStartingMembership(user.id).catch(() => {});
  const [profile, prefs, answers, [{ unread }], legal] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) }),
    db.query.preferences.findFirst({ where: eq(schema.preferences.userId, user.id) }),
    db.select().from(schema.personalityAnswers).where(eq(schema.personalityAnswers.userId, user.id)),
    db.select({ unread: count() }).from(schema.notifications).where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))),
    pendingLegal(user.id),
  ]);
  const fresh = (await db.query.users.findFirst({ where: eq(schema.users.id, user.id) })) ?? user;
  const features = await planFeatures(fresh.planCode, fresh.planEndsAt);
  const membership = await membershipStatus(user.id);
  const { lat: _lat, lng: _lng, ...safeProfile } = profile ?? ({} as Record<string, unknown>);
  return ok({
    user: {
      id: user.id, email: user.email, phone: user.phone, dob: user.dob, role: user.role, status: user.status,
      emailVerified: user.emailVerified, phoneVerified: user.phoneVerified, selfieStatus: user.selfieStatus,
      planCode: fresh.planCode, planEndsAt: fresh.planEndsAt, onboardingStep: user.onboardingStep,
      permissions: ROLE_PERMISSIONS[user.role as Role] ?? [],
    },
    profile: profile ? safeProfile : null,
    preferences: prefs ?? null,
    answers: Object.fromEntries(answers.map((a) => [a.questionKey, a.value])),
    features,
    membership,
    unreadNotifications: unread,
    pendingLegal: legal,
  });
}, { allowSuspended: true });

/** Deletes the account (see lib/privacy deleteAccount for what is removed and what the law makes us keep). Requires password re-entry. */
export const DELETE = route(async ({ req, user }) => {
  const { password } = await parseBody(req, z.object({ password: z.string().min(1) }));
  if (!(await verifyPassword(password, user.passwordHash))) throw new ApiError(401, "That password isn't right.", "bad_credentials");
  const result = await deleteAccount(user);
  await destroySession();
  return ok(result);
}, { allowSuspended: true });
