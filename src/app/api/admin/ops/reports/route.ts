import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { buildProductReport } from "@/lib/productReport";

/** Weekly product health reports; `?preview=1` computes last week now without saving. */
export const GET = route(async ({ req }) => {
  if (new URL(req.url).searchParams.get("preview")) return ok({ report: await buildProductReport(), preview: true });
  const rows = await db.select().from(schema.opsReports).orderBy(desc(schema.opsReports.week)).limit(12);
  return ok({ report: rows[0] ? JSON.parse(rows[0].data) : null, weeks: rows.map((r) => r.week), history: rows.map((r) => ({ week: r.week, ...JSON.parse(r.data).metrics })) });
}, { permission: "ops.view" });
