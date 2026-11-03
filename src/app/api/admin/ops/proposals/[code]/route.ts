import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { opsAction } from "@/lib/ops";
import { can } from "@/lib/rbac";

/** Approve (→ GitHub issue for the AI engineer on the next sync) or reject an improvement proposal. */
export const PATCH = route<{ code: string }>(async ({ req, user, params }) => {
  if (!can(user.role, "ops.manage")) throw new ApiError(403, "You don't have permission to decide proposals.", "forbidden");
  const p = await db.query.opsProposals.findFirst({ where: eq(schema.opsProposals.code, params.code.slice(0, 20)) });
  if (!p) throw new ApiError(404, "No proposal with that code.", "not_found");
  const b = await parseBody(req, z.object({ decision: z.enum(["APPROVED", "REJECTED", "PROPOSED"]), note: z.string().trim().max(500).default("") }));
  if (!["PROPOSED", "APPROVED", "REJECTED"].includes(p.status)) throw new ApiError(409, "This proposal is already being built.", "conflict");
  if (b.decision === "APPROVED" && p.risk === "HIGH" && b.note.length < 10) throw new ApiError(422, "note: High-risk proposals need a short reason for approving.", "validation");
  await db.update(schema.opsProposals).set({ status: b.decision, decidedById: b.decision === "PROPOSED" ? null : user.id, decidedAt: b.decision === "PROPOSED" ? null : new Date() }).where(eq(schema.opsProposals.id, p.id));
  await opsAction("ADMIN", `proposal_${b.decision.toLowerCase()}`, { proposalId: p.id, detail: { code: p.code, by: user.id, note: b.note } });
  await audit(user.id, "ops.proposal.decide", "ops_proposal", p.id, { code: p.code, decision: b.decision });
  return ok({ saved: true });
}, { permission: "ops.view" });
