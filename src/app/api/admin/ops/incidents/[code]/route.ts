import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { opsAction, riskBand } from "@/lib/ops";
import { similarIncidents } from "@/lib/opsAdmin";
import { can } from "@/lib/rbac";

async function find(code: string) {
  const inc = await db.query.opsIncidents.findFirst({ where: eq(schema.opsIncidents.code, code.slice(0, 20)) });
  if (!inc) throw new ApiError(404, "No incident with that code.", "not_found");
  return inc;
}

export const GET = route<{ code: string }>(async ({ params }) => {
  const inc = await find(params.code);
  const events = await db.select({ at: schema.opsIncidentEvents.at, release: schema.opsIncidentEvents.release, context: schema.opsIncidentEvents.context }).from(schema.opsIncidentEvents)
    .where(eq(schema.opsIncidentEvents.incidentId, inc.id)).orderBy(desc(schema.opsIncidentEvents.at)).limit(20);
  const actions = await db.select().from(schema.opsActions).where(eq(schema.opsActions.incidentId, inc.id)).orderBy(desc(schema.opsActions.at)).limit(50);
  const repo = process.env.GITHUB_REPO;
  return ok({
    incident: { ...inc, sample: JSON.parse(inc.sample), band: riskBand(inc.risk), issueUrl: repo && inc.githubIssue ? `https://github.com/${repo}/issues/${inc.githubIssue}` : null },
    events: events.map((e) => ({ ...e, context: JSON.parse(e.context) })), actions: actions.map((a) => ({ ...a, detail: JSON.parse(a.detail) })), similar: await similarIncidents(inc),
  });
}, { permission: "ops.view" });

// Staff triage: mark as looked at, won't fix, ignore (noise), reopen, or fixed by hand; add a diagnosis note.
export const PATCH = route<{ code: string }>(async ({ req, user, params }) => {
  if (!can(user.role, "ops.manage")) throw new ApiError(403, "You don't have permission to change incidents.", "forbidden");
  const inc = await find(params.code);
  const b = await parseBody(req, z.object({ status: z.enum(["NEW", "TRIAGED", "FIXED", "WONT_FIX", "IGNORED"]).optional(), diagnosis: z.string().trim().max(4000).optional(), note: z.string().trim().max(500).default("") }));
  if (!b.status && b.diagnosis === undefined) throw new ApiError(422, "Nothing to change.", "validation");
  await db.update(schema.opsIncidents).set({ ...(b.status ? { status: b.status, ...(b.status === "FIXED" ? { fixedAt: new Date() } : {}) } : {}), ...(b.diagnosis !== undefined ? { diagnosis: b.diagnosis || null } : {}) }).where(eq(schema.opsIncidents.id, inc.id));
  await opsAction("ADMIN", b.status ? `status_${b.status.toLowerCase()}` : "diagnosis_edited", { incidentId: inc.id, risk: inc.risk, detail: { code: inc.code, by: user.id, from: inc.status, note: b.note } });
  await audit(user.id, "ops.incident.update", "ops_incident", inc.id, { code: inc.code, status: b.status, from: inc.status });
  return ok({ saved: true });
}, { permission: "ops.view" });
