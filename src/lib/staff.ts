import "server-only";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { getConfig } from "./config";
import { ApiError } from "./http-error";

// Staff security for every admin API:
//  • 2-step verification is required for staff (ADMIN_MFA_OPTIONAL=true turns this off for local tests only);
//  • the admin tools lock after N minutes without admin activity and need the 2-step code again.
export const staffMfaRequired = () => process.env.ADMIN_MFA_OPTIONAL !== "true";

export async function staffState(user: User) {
  const idle = await getConfig("admin.idleTimeoutMinutes");
  const unlocked = !!user.staffUnlockedAt && Date.now() - user.staffUnlockedAt.getTime() < idle * 60_000;
  return { mfaEnabled: !!user.totpSecret, mfaRequired: staffMfaRequired(), unlocked, idleMinutes: idle };
}

export async function staffGate(user: User) {
  if (user.role === "USER") return;
  const s = await staffState(user);
  if (s.mfaRequired && !s.mfaEnabled) throw new ApiError(403, "Staff accounts must turn on 2-step verification before using admin tools.", "staff_mfa_required");
  if (!s.unlocked) throw new ApiError(401, "Admin tools locked after inactivity. Enter your 2-step code to continue.", "staff_unlock_required");
  // Sliding window: refresh at most once a minute.
  if (Date.now() - user.staffUnlockedAt!.getTime() > 60_000)
    await db.update(schema.users).set({ staffUnlockedAt: new Date() }).where(eq(schema.users.id, user.id));
}

const SENSITIVE = ["admin.view_user", "admin.view_evidence", "admin.view_report", "admin.export_user"];

/** Many private-record views in an hour by one staff member → alert super admins (once per hour). */
export async function sensitiveAccessCheck(staffId: string) {
  const limit = await getConfig("admin.sensitiveViewsPerHourAlert");
  const since = new Date(Date.now() - 3600_000);
  const [r] = await db.select({ n: count() }).from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.actorId, staffId), inArray(schema.auditLogs.action, SENSITIVE), gte(schema.auditLogs.createdAt, since)));
  if ((r?.n ?? 0) < limit) return false;
  const already = await db.query.auditLogs.findFirst({ where: and(eq(schema.auditLogs.action, "security.staff_anomaly"), eq(schema.auditLogs.entityId, staffId), gte(schema.auditLogs.createdAt, since)) });
  if (already) return true;
  const { audit } = await import("./audit");
  const { notify } = await import("./notify");
  await audit(null, "security.staff_anomaly", "user", staffId, { views: r.n, windowMinutes: 60 });
  const supers = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "SUPER_ADMIN"));
  for (const s of supers) if (s.id !== staffId) await notify(s.id, "SECURITY", "Unusual staff activity", `A staff account opened ${r.n} private records in the last hour. Check Admin → Audit log.`, "/admin/audit");
  return true;
}
