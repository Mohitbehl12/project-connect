import { sensitiveAccessCheck } from "@/lib/staff";
import { liftRestriction } from "@/lib/safety";
import { grantStartingMembership } from "@/lib/billing";
import { onVerified } from "@/lib/referrals";
import { z } from "zod";
import { closeVerification } from "@/lib/verification";
import { and, count, desc, eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { audit } from "@/lib/audit";
import { revokeAllSessions } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { can } from "@/lib/rbac";
import { ROLES } from "@/lib/constants";
import { ageFromDob } from "@/lib/matching";

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, params.id) });
  if (!u) throw new ApiError(404, "User not found.", "not_found");
  const p = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, u.id) });
  const [reportsAgainst, reportsMade, actions, audits, [{ likesSent }], [{ matchCount }], subs] = await Promise.all([
    db.select().from(schema.reports).where(eq(schema.reports.reportedId, u.id)).orderBy(desc(schema.reports.createdAt)).limit(50),
    db.select().from(schema.reports).where(eq(schema.reports.reporterId, u.id)).orderBy(desc(schema.reports.createdAt)).limit(20),
    db.select().from(schema.moderationActions).where(eq(schema.moderationActions.targetUserId, u.id)).orderBy(desc(schema.moderationActions.createdAt)),
    db.select().from(schema.auditLogs).where(or(eq(schema.auditLogs.entityId, u.id), eq(schema.auditLogs.actorId, u.id))).orderBy(desc(schema.auditLogs.createdAt)).limit(50),
    db.select({ likesSent: count() }).from(schema.likes).where(eq(schema.likes.fromId, u.id)),
    db.select({ matchCount: count() }).from(schema.matches).where(or(eq(schema.matches.userAId, u.id), eq(schema.matches.userBId, u.id))),
    db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, u.id)).orderBy(desc(schema.subscriptions.startedAt)),
  ]);
  await audit(user.id, "admin.view_user", "user", u.id);
  await sensitiveAccessCheck(user.id);

  // Precise coordinates are not shown even to admins; city is enough for moderation.
  const profile = p ? { ...p, lat: undefined, lng: undefined, age: ageFromDob(p.dob), interests: p.interests.split(",").filter(Boolean), prompts: JSON.parse(p.prompts) } : null;
  return ok({
    user: {
      id: u.id, email: u.email, phone: can(user.role, "users.ban") ? u.phone : u.phone ? "•••• " + u.phone.slice(-3) : null,
      role: u.role, status: u.status, emailVerified: u.emailVerified, phoneVerified: u.phoneVerified, selfieStatus: u.selfieStatus,
      planCode: u.planCode, planEndsAt: u.planEndsAt, createdAt: u.createdAt, lastActiveAt: u.lastActiveAt, onboardingStep: u.onboardingStep,
    },
    profile, reportsAgainst, reportsMade, actions, audits, subscriptions: subs,
    stats: { likesSent, matches: matchCount },
  });
}, { permission: "users.view" });

const ActionBody = z.object({
  action: z.enum(["WARN", "SUSPEND", "BAN", "RESTORE", "VERIFY", "REJECT_VERIFICATION", "SET_ROLE", "REVOKE_SESSIONS"]),
  reason: z.string().trim().min(3, "Add a short reason for the record").max(500),
  reportId: z.string().optional(),
  role: z.enum(ROLES).optional(),
});

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, ActionBody);
  const target = await db.query.users.findFirst({ where: eq(schema.users.id, params.id) });
  if (!target) throw new ApiError(404, "User not found.", "not_found");
  if (target.id === user.id) throw new ApiError(400, "You can't take moderation actions on your own account.", "self");

  const need = { BAN: "users.ban", SET_ROLE: "roles.assign", VERIFY: "users.verify", REJECT_VERIFICATION: "users.verify" } as const;
  const perm = need[b.action as keyof typeof need] ?? "users.moderate";
  if (!can(user.role, perm)) throw new ApiError(403, "You don't have permission to do that.", "forbidden");
  // Staff accounts can only be moderated by someone who can assign roles.
  if (target.role !== "USER" && !can(user.role, "roles.assign")) throw new ApiError(403, "Only a super admin can act on staff accounts.", "forbidden");

  const U = schema.users;
  switch (b.action) {
    case "WARN":
      await notify(target.id, "MODERATION", "A warning about your account", b.reason);
      break;
    case "SUSPEND":
      await db.update(U).set({ status: "SUSPENDED" }).where(eq(U.id, target.id));
      await notify(target.id, "MODERATION", "Your account is suspended", b.reason);
      break;
    case "BAN":
      await db.update(U).set({ status: "BANNED", tokenVersion: target.tokenVersion + 1 }).where(eq(U.id, target.id));
      await db.update(schema.matches).set({ status: "UNMATCHED", unmatchedBy: user.id, endedAt: new Date() })
        .where(and(eq(schema.matches.status, "ACTIVE"), or(eq(schema.matches.userAId, target.id), eq(schema.matches.userBId, target.id))));
      break;
    case "RESTORE":
      await db.update(U).set({ status: "ACTIVE" }).where(eq(U.id, target.id));
      await liftRestriction(target.id, user.id, "restored by staff");
      await notify(target.id, "MODERATION", "Your account is active again", b.reason);
      break;
    case "VERIFY":
      await db.update(U).set({ selfieStatus: "VERIFIED" }).where(eq(U.id, target.id));
      await closeVerification(target.id, true, user.id, b.reason); // deletes the selfie image
      await grantStartingMembership(target.id).catch(() => {}); // e.g. free forever after a verified gender change
      await notify(target.id, "VERIFICATION", "You're verified", "Your profile now shows a verified badge.");
      await onVerified(target.id); // referral reward + optional verification reward
      await liftRestriction(target.id, user.id, "selfie verified");
      break;
    case "REJECT_VERIFICATION":
      await db.update(U).set({ selfieStatus: "REJECTED" }).where(eq(U.id, target.id));
      await closeVerification(target.id, false, user.id, b.reason); // deletes the selfie image
      await notify(target.id, "VERIFICATION", "Verification not approved", b.reason);
      break;
    case "SET_ROLE":
      if (!b.role) throw new ApiError(422, "role: Choose a role.", "validation");
      await db.update(U).set({ role: b.role, tokenVersion: target.tokenVersion + 1 }).where(eq(U.id, target.id));
      break;
    case "REVOKE_SESSIONS":
      await db.update(U).set({ tokenVersion: target.tokenVersion + 1 }).where(eq(U.id, target.id));
      break;
  }

  if (["BAN", "SET_ROLE", "REVOKE_SESSIONS"].includes(b.action)) await revokeAllSessions(target.id);
  await db.insert(schema.moderationActions).values({ actorId: user.id, targetUserId: target.id, action: b.action, reason: b.reason, reportId: b.reportId });
  await audit(user.id, `moderation.${b.action.toLowerCase()}`, "user", target.id, { reason: b.reason, reportId: b.reportId, role: b.role });
  return ok({ done: true });
}, { permission: "users.moderate" });
