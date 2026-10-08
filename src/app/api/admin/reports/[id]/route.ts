import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { notify } from "@/lib/notify";

/** Report detail with evidence: the reported conversation (only for staff with messages.view_reported). */
export const GET = route<{ id: string }>(async ({ user, params }) => {
  const r = await db.query.reports.findFirst({ where: eq(schema.reports.id, params.id) });
  if (!r) throw new ApiError(404, "Report not found.", "not_found");
  let evidence: { id: string; fromReported: boolean; body: string; deleted: boolean; flags: string; createdAt: Date; highlighted: boolean }[] = [];
  if (r.matchId && can(user.role, "messages.view_reported")) {
    const msgs = await db.select().from(schema.messages).where(eq(schema.messages.matchId, r.matchId)).orderBy(asc(schema.messages.createdAt)).limit(300);
    evidence = msgs.map((m) => ({
      id: m.id, fromReported: m.senderId === r.reportedId, body: m.body, deleted: !!m.deletedAt, flags: m.flags, createdAt: m.createdAt, highlighted: m.id === r.messageId,
    }));
    await audit(user.id, "admin.view_evidence", "report", r.id, { matchId: r.matchId, messages: evidence.length });
  }
  const reported = await db.select({ u: schema.users, p: schema.profiles }).from(schema.users)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id)).where(eq(schema.users.id, r.reportedId));
  const history = await db.select().from(schema.reports).where(eq(schema.reports.reportedId, r.reportedId));
  return ok({
    report: r,
    reported: reported[0] ? { id: reported[0].u.id, email: reported[0].u.email, status: reported[0].u.status, selfieStatus: reported[0].u.selfieStatus, name: reported[0].p?.firstName, bio: reported[0].p?.bio } : null,
    priorReports: history.length - 1,
    evidence,
  });
}, { permission: "reports.view" });

const Body = z.object({
  status: z.enum(["ACTIONED", "DISMISSED"]),
  resolution: z.string().trim().min(3, "Add a short note for the record").max(1000),
});

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, Body);
  const r = await db.query.reports.findFirst({ where: eq(schema.reports.id, params.id) });
  if (!r) throw new ApiError(404, "Report not found.", "not_found");
  if (r.status !== "OPEN") throw new ApiError(409, "This report is already closed.", "closed");
  await db.update(schema.reports).set({ status: b.status, resolution: b.resolution, resolvedById: user.id, resolvedAt: new Date() })
    .where(eq(schema.reports.id, r.id));
  await audit(user.id, `report.${b.status.toLowerCase()}`, "report", r.id, { resolution: b.resolution });
  if (r.reporterId) await notify(r.reporterId, "REPORT", "Your report was reviewed", "Thanks for helping keep Project Connect safe.");
  return ok({ closed: true });
}, { permission: "reports.resolve" });
