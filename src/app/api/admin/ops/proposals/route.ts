import { count, desc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { opsAction } from "@/lib/ops";
import { can } from "@/lib/rbac";

export const GET = route(async ({ req }) => {
  const status = new URL(req.url).searchParams.get("status");
  const rows = await db.select().from(schema.opsProposals).where(status ? eq(schema.opsProposals.status, status) : undefined).orderBy(desc(schema.opsProposals.createdAt)).limit(100);
  const repo = process.env.GITHUB_REPO;
  return ok({ proposals: rows.map((p) => ({ ...p, evidence: JSON.parse(p.evidence), issueUrl: repo && p.githubIssue ? `https://github.com/${repo}/issues/${p.githubIssue}` : null })) });
}, { permission: "ops.view" });

/** Staff can add their own idea; it goes through the same approve → issue → PR path. */
export const POST = route(async ({ req, user }) => {
  if (!can(user.role, "ops.manage")) throw new ApiError(403, "You don't have permission to add proposals.", "forbidden");
  const b = await parseBody(req, z.object({
    title: z.string().trim().min(5).max(140), problem: z.string().trim().min(10).max(2000), benefit: z.string().trim().min(5).max(1000),
    changes: z.string().trim().max(3000).default(""), risk: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"), complexity: z.enum(["S", "M", "L"]).default("M"),
  }));
  const year = new Date().getUTCFullYear();
  const [{ n }] = await db.select({ n: count() }).from(schema.opsProposals).where(like(schema.opsProposals.code, `FEAT-${year}-%`));
  const code = `FEAT-${year}-${String(n + 1).padStart(4, "0")}`;
  const [p] = await db.insert(schema.opsProposals).values({ ...b, code, signal: `manual:${code}`, source: "STAFF", evidence: JSON.stringify({ addedBy: "staff" }) }).returning();
  await opsAction("ADMIN", "proposal_added", { proposalId: p.id, detail: { code, by: user.id } });
  await audit(user.id, "ops.proposal.create", "ops_proposal", p.id, { code });
  return ok({ code }, 201);
}, { permission: "ops.view" });
