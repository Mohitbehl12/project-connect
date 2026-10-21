import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { logAdAudit } from "@/lib/ads";
import { ApiError, ok, parseBody, route } from "@/lib/http";

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, z.object({ action: z.enum(["action", "dismiss"]), resolution: z.string().trim().min(3).max(500) }));
  const r = await db.query.adReports.findFirst({ where: eq(schema.adReports.id, params.id) });
  if (!r) throw new ApiError(404, "Report not found.", "not_found");
  await db.update(schema.adReports).set({ status: b.action === "action" ? "ACTIONED" : "DISMISSED", resolution: b.resolution }).where(eq(schema.adReports.id, r.id));
  await logAdAudit(user.id, `report_${b.action}`, r.campaignId, { caseNo: r.caseNo });
  return ok({ done: true });
}, { permission: "ads.review" });
