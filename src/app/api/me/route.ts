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

/** The signed-in user's own data. This is the only endpoint that returns private fields, and only to their owner. */
export const GET = route(async ({ user }) => {
  const [profile, prefs, answers, [{ unread }], legal] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) }),
    db.query.preferences.findFirst({ where: eq(schema.preferences.userId, user.id) }),
    db.select().from(schema.personalityAnswers).where(eq(schema.personalityAnswers.userId, user.id)),
    db.select({ unread: count() }).from(schema.notifications).where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))),
    pendingLegal(user.id),
  ]);
  const features = await planFeatures(user.planCode, user.planEndsAt);
  const { lat: _lat, lng: _lng, ...safeProfile } = profile ?? ({} as Record<string, unknown>);
  return ok({
    user: {
      id: user.id, email: user.email, phone: user.phone, dob: user.dob, role: user.role, status: user.status,
      emailVerified: user.emailVerified, phoneVerified: user.phoneVerified, selfieStatus: user.selfieStatus,
      planCode: user.planCode, planEndsAt: user.planEndsAt, onboardingStep: user.onboardingStep,
      permissions: ROLE_PERMISSIONS[user.role as Role] ?? [],
    },
    profile: profile ? safeProfile : null,
    preferences: prefs ?? null,
    answers: Object.fromEntries(answers.map((a) => [a.questionKey, a.value])),
    features,
    unreadNotifications: unread,
    pendingLegal: legal,
  });
}, { allowSuspended: true });

/** Permanently deletes the account and all personal data (cascades). Requires password re-entry. */
export const DELETE = route(async ({ req, user }) => {
  const { password } = await parseBody(req, z.object({ password: z.string().min(1) }));
  if (!(await verifyPassword(password, user.passwordHash))) throw new ApiError(401, "That password isn't right.", "bad_credentials");
  await audit(user.id, "user.delete_account", "user", user.id);
  const files = await db.select({ key: schema.photos.storageKey }).from(schema.photos).where(eq(schema.photos.userId, user.id));
  for (const f of files) await storage().delete(f.key).catch(() => {});
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  await destroySession();
  return ok({ deleted: true });
}, { allowSuspended: true });
