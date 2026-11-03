import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

/** The ops trail: everything the monitor, watchdog, GitHub sync, AI engineer and staff did. Read-only. */
export const GET = route(async ({ req }) => {
  const u = new URL(req.url);
  const agent = u.searchParams.get("agent"), page = Math.max(1, Number(u.searchParams.get("page")) || 1);
  const rows = await db.select().from(schema.opsActions).where(agent ? eq(schema.opsActions.agent, agent) : undefined).orderBy(desc(schema.opsActions.at)).limit(50).offset((page - 1) * 50);
  return ok({ page, actions: rows.map((a) => ({ ...a, detail: JSON.parse(a.detail) })) });
}, { permission: "ops.view" });
