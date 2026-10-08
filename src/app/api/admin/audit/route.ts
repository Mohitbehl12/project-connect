import { desc, inArray, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

export const GET = route(async ({ req }) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const rows = await db.select().from(schema.auditLogs)
    .where(action ? like(schema.auditLogs.action, `${action}%`) : undefined)
    .orderBy(desc(schema.auditLogs.createdAt)).limit(50).offset((page - 1) * 50);
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])];
  const actors = actorIds.length ? await db.select({ id: schema.users.id, email: schema.users.email, role: schema.users.role }).from(schema.users).where(inArray(schema.users.id, actorIds)) : [];
  const byId = new Map(actors.map((a) => [a.id, a]));
  return ok({ page, logs: rows.map((r) => ({ ...r, meta: JSON.parse(r.meta), actor: r.actorId ? byId.get(r.actorId) ?? null : null })) });
}, { permission: "audit.view" });

