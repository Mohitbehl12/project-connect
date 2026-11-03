import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

const OPEN = ["NEW", "TRIAGED", "PR_OPEN", "REGRESSED"];

export const GET = route(async ({ req }) => {
  const u = new URL(req.url);
  const status = u.searchParams.get("status") ?? "open", severity = u.searchParams.get("severity"), kind = u.searchParams.get("kind"), q = (u.searchParams.get("q") ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number(u.searchParams.get("page")) || 1);
  const rows = await db.select({
    code: schema.opsIncidents.code, kind: schema.opsIncidents.kind, title: schema.opsIncidents.title, service: schema.opsIncidents.service, severity: schema.opsIncidents.severity, risk: schema.opsIncidents.risk,
    status: schema.opsIncidents.status, count: schema.opsIncidents.count, usersAffected: schema.opsIncidents.usersAffected, firstSeen: schema.opsIncidents.firstSeen, lastSeen: schema.opsIncidents.lastSeen, prUrl: schema.opsIncidents.prUrl, githubIssue: schema.opsIncidents.githubIssue,
  }).from(schema.opsIncidents).where(and(
    status === "open" ? inArray(schema.opsIncidents.status, OPEN) : status === "all" ? undefined : eq(schema.opsIncidents.status, status),
    severity ? eq(schema.opsIncidents.severity, severity) : undefined,
    kind ? eq(schema.opsIncidents.kind, kind) : undefined,
    q ? or(like(schema.opsIncidents.title, `%${q}%`), like(schema.opsIncidents.code, `%${q}%`), like(schema.opsIncidents.service, `%${q}%`)) : undefined,
  )).orderBy(desc(schema.opsIncidents.lastSeen)).limit(50).offset((page - 1) * 50);
  return ok({ page, incidents: rows });
}, { permission: "ops.view" });
