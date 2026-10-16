import { endCallsBetween } from "@/lib/calls";
import { z } from "zod";
import { and, eq, gte, isNotNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { REPORT_CATEGORIES, REPORT_PRIORITY, type ReportCategory } from "@/lib/constants";
import { rateLimit } from "@/lib/ratelimit";
import { getConfig } from "@/lib/config";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { orderedPair } from "@/lib/matches";

const Body = z.object({
  reportedId: z.string().min(1).max(64),
  category: z.enum(Object.keys(REPORT_CATEGORIES) as [string, ...string[]]),
  details: z.string().trim().max(1000).default(""),
  matchId: z.string().max(64).optional(),
  messageId: z.string().max(64).optional(),
  alsoBlock: z.boolean().default(true),
});

export const POST = route(async ({ req, user }) => {
  rateLimit(`report:${user.id}`, 20, 60 * 60_000);
  const b = await parseBody(req, Body);
  if (b.reportedId === user.id) throw new ApiError(400, "You can't report yourself.", "self");
  const target = await db.query.users.findFirst({ where: eq(schema.users.id, b.reportedId) });
  if (!target) throw new ApiError(404, "This profile no longer exists.", "not_found");

  // A message being reported must belong to a match the reporter is part of.
  if (b.messageId) {
    const msg = await db.query.messages.findFirst({ where: eq(schema.messages.id, b.messageId) });
    const m = msg && (await db.query.matches.findFirst({ where: eq(schema.matches.id, msg.matchId) }));
    if (!m || (m.userAId !== user.id && m.userBId !== user.id) || msg!.senderId !== b.reportedId)
      throw new ApiError(404, "Message not found.", "not_found");
    b.matchId = m.id;
  }

  const [report] = await db.insert(schema.reports).values({
    reporterId: user.id, reportedId: b.reportedId, category: b.category, details: b.details,
    matchId: b.matchId ?? null, messageId: b.messageId ?? null, priority: REPORT_PRIORITY[b.category as ReportCategory],
  }).returning();

  if (b.alsoBlock) {
    await db.insert(schema.blocks).values({ blockerId: user.id, blockedId: b.reportedId }).onConflictDoNothing();
    const [a, z2] = orderedPair(user.id, b.reportedId);
    await db.update(schema.matches).set({ status: "UNMATCHED", unmatchedBy: user.id })
      .where(and(eq(schema.matches.userAId, a), eq(schema.matches.userBId, z2)));
    await endCallsBetween(user.id, b.reportedId);
  }

  // Auto-suspend pending review when several different people report the same account.
  const threshold = await getConfig("safety.autoSuspendReportThreshold");
  const recent = await db.select({ r: schema.reports.reporterId }).from(schema.reports)
    .where(and(eq(schema.reports.reportedId, b.reportedId), isNotNull(schema.reports.reporterId), gte(schema.reports.createdAt, new Date(Date.now() - 30 * 86400_000))));
  const distinct = new Set(recent.map((x) => x.r)).size;
  if (distinct >= threshold && target.status === "ACTIVE") {
    await db.update(schema.users).set({ status: "SUSPENDED" }).where(eq(schema.users.id, target.id));
    await audit(null, "safety.auto_suspend", "user", target.id, { distinctReporters: distinct });
    await notify(target.id, "MODERATION", "Your account is under review", "We've paused your account while our team reviews reports. You'll hear from us soon.");
  }

  await notify(user.id, "REPORT", "Thanks for your report", "Our safety team will review it. You won't see this person again.");
  return ok({ id: report.id, blocked: b.alsoBlock }, 201);
});

/** My submitted reports and their status (no details about actions taken against the other person). */
export const GET = route(async ({ user }) => {
  const rows = await db.select({ id: schema.reports.id, category: schema.reports.category, status: schema.reports.status, createdAt: schema.reports.createdAt })
    .from(schema.reports).where(or(eq(schema.reports.reporterId, user.id)));
  return ok({ reports: rows.map((r) => ({ ...r, status: r.status === "OPEN" ? "Under review" : "Reviewed" })) });
}, { allowSuspended: true });
