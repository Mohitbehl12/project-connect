import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

export const GET = route(async ({ req }) => {
  const status = new URL(req.url).searchParams.get("status") ?? "OPEN";
  const rows = await db.select().from(schema.reports)
    .where(status === "ALL" ? undefined : eq(schema.reports.status, status))
    .orderBy(sql`case ${schema.reports.priority} when 'CRITICAL' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end`, desc(schema.reports.createdAt))
    .limit(200);
  const ids = [...new Set(rows.flatMap((r) => [r.reportedId, r.reporterId].filter(Boolean) as string[]))];
  const people = ids.length
    ? await db.select({ id: schema.users.id, email: schema.users.email, status: schema.users.status, name: schema.profiles.firstName })
        .from(schema.users).leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id)).where(inArray(schema.users.id, ids))
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return ok({
    reports: rows.map((r) => ({ ...r, reported: byId.get(r.reportedId) ?? null, reporter: r.reporterId ? byId.get(r.reporterId) ?? null : null })),
  });
}, { permission: "reports.view" });

