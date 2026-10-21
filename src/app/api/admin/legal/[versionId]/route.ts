import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";

// Workflow: DRAFT → IN_REVIEW → PUBLISHED. Publishing supersedes the previous published version;
// existing acceptances stay attached to the version the user actually accepted.
const Body = z.object({
  action: z.enum(["submit_review", "back_to_draft", "publish", "update_draft", "record_lawyer_review"]),
  body: z.string().trim().min(20).max(100_000).optional(),
  changeSummary: z.string().trim().max(1000).optional(),
  material: z.boolean().optional(),
  reviewer: z.string().trim().min(3).max(200).optional(), // the qualified lawyer or firm who reviewed this text
  effectiveAt: z.string().datetime({ offset: true }).optional(),
});

export const POST = route<{ versionId: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, Body);
  const v = await db.query.legalVersions.findFirst({ where: eq(schema.legalVersions.id, params.versionId) });
  if (!v) throw new ApiError(404, "Version not found.", "not_found");
  const T = schema.legalVersions;

  if (b.action === "update_draft") {
    if (v.status !== "DRAFT") throw new ApiError(409, "Only drafts can be edited. Create a new version instead.", "not_draft");
    if (!b.body) throw new ApiError(422, "body is required.", "validation");
    await db.update(T).set({ body: b.body, ...(b.changeSummary !== undefined ? { changeSummary: b.changeSummary } : {}), ...(b.material !== undefined ? { material: b.material } : {}) }).where(eq(T.id, v.id));
  } else if (b.action === "record_lawyer_review") {
    // Records that a qualified lawyer reviewed exactly this text. Staff enter who; the audit log records who entered it.
    if (!b.reviewer) throw new ApiError(422, "reviewer: Enter the name of the lawyer or firm who reviewed this version.", "validation");
    if (v.status === "DRAFT") throw new ApiError(409, "Send the draft for review first — the reviewed text must be final.", "bad_state");
    await db.update(T).set({ lawyerReviewedBy: b.reviewer, lawyerReviewedAt: new Date() }).where(eq(T.id, v.id));
  } else if (b.action === "submit_review") {
    if (v.status !== "DRAFT") throw new ApiError(409, "Only drafts can be sent for review.", "not_draft");
    await db.update(T).set({ status: "IN_REVIEW" }).where(eq(T.id, v.id));
  } else if (b.action === "back_to_draft") {
    if (v.status !== "IN_REVIEW") throw new ApiError(409, "Only versions in review can go back to draft.", "bad_state");
    await db.update(T).set({ status: "DRAFT" }).where(eq(T.id, v.id));
  } else {
    if (!can(user.role, "legal.publish")) throw new ApiError(403, "Publishing legal documents needs a super admin.", "forbidden");
    if (v.status !== "IN_REVIEW") throw new ApiError(409, "Send this version for review before publishing.", "bad_state");
    if (v.createdById === user.id) throw new ApiError(403, "Someone other than the author must publish this version.", "four_eyes");
    if (!v.changeSummary && v.version > 1) throw new ApiError(422, "Add a short summary of what changed — members see it with the new version.", "change_summary_required");
    await db.update(T).set({ status: "SUPERSEDED" }).where(and(eq(T.documentId, v.documentId), eq(T.status, "PUBLISHED")));
    await db.update(T).set({ status: "PUBLISHED", publishedAt: new Date(), effectiveAt: b.effectiveAt ? new Date(b.effectiveAt) : new Date() })
      .where(eq(T.id, v.id));
  }
  await audit(user.id, `legal.${b.action}`, "legal_version", v.id, { version: v.version, ...(b.reviewer ? { reviewer: b.reviewer } : {}) });
  return ok({ done: true });
}, { permission: "legal.edit" });
