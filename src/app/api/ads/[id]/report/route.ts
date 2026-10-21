import { z } from "zod";
import { count, eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { REPORT_REASONS, logAdAudit } from "@/lib/ads";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { caseNo } from "@/lib/safety";

/** Report an ad. Several reports pause it until a person looks. */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  await rateLimit(`ad-report:${user.id}`, 20, 60 * 60_000);
  const b = await parseBody(req, z.object({ reason: z.enum(Object.keys(REPORT_REASONS) as [string, ...string[]]), details: z.string().trim().max(1000).default("") }));
  const c = await db.query.adCampaigns.findFirst({ where: eq(schema.adCampaigns.id, params.id) });
  if (!c) throw new ApiError(404, "Ad not found.", "not_found");
  const [r] = await db.insert(schema.adReports).values({ caseNo: caseNo("R"), campaignId: c.id, reporterId: user.id, reason: b.reason, details: b.details }).returning();
  await db.insert(schema.adHidden).values({ userId: user.id, campaignId: c.id }).onConflictDoNothing();
  const [{ n }] = await db.select({ n: count() }).from(schema.adReports).where(and(eq(schema.adReports.campaignId, c.id), eq(schema.adReports.status, "OPEN")));
  if (n >= 3 && c.status === "ACTIVE") { await db.update(schema.adCampaigns).set({ status: "PAUSED", reviewNote: "Paused automatically after several reports" }).where(eq(schema.adCampaigns.id, c.id)); await logAdAudit(null, "auto_pause_reports", c.id, { reports: n }); }
  return ok({ caseNo: r.caseNo, message: `Your report has been received. Case ${r.caseNo}. You won't see this ad again.` }, 201);
});
