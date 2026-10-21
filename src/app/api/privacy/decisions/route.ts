import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

/** Automated decisions about me (photo checks, message flags, risk restrictions), so I can understand and appeal them. */
export const GET = route(async ({ user }) => {
  const rows = await db.select().from(schema.automatedDecisions).where(eq(schema.automatedDecisions.userId, user.id)).orderBy(desc(schema.automatedDecisions.createdAt)).limit(50);
  return ok({
    restricted: !!user.restrictedAt,
    decisions: rows.map((d) => ({ id: d.id, kind: d.kind, decision: d.decision, reason: d.reason, at: d.createdAt, reviewed: d.reviewOutcome })),
  });
}, { allowSuspended: true });
