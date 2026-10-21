import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { APPEAL_KINDS } from "@/lib/appeals";

/** Appeal queue: open first. Shows the person's recent moderation and automated decisions for context. */
export const GET = route(async ({ req }) => {
  const status = new URL(req.url).searchParams.get("status") ?? "OPEN";
  const rows = await db.select().from(schema.appeals).where(eq(schema.appeals.status, status)).orderBy(desc(schema.appeals.createdAt)).limit(200);
  const ids = rows.map((r) => r.userId).filter((x): x is string => !!x);
  const [users, actions, decisions] = ids.length ? await Promise.all([
    db.select({ id: schema.users.id, email: schema.users.email, status: schema.users.status, restrictedAt: schema.users.restrictedAt }).from(schema.users).where(inArray(schema.users.id, ids)),
    db.select().from(schema.moderationActions).where(inArray(schema.moderationActions.targetUserId, ids)).orderBy(desc(schema.moderationActions.createdAt)),
    db.select().from(schema.automatedDecisions).where(inArray(schema.automatedDecisions.userId, ids)).orderBy(desc(schema.automatedDecisions.createdAt)),
  ]) : [[], [], []];
  return ok({
    kinds: APPEAL_KINDS,
    appeals: rows.map((r) => ({
      ...r,
      user: users.find((u) => u.id === r.userId) ?? null,
      history: actions.filter((a) => a.targetUserId === r.userId).slice(0, 5).map((a) => ({ action: a.action, reason: a.reason, by: a.actorId, at: a.createdAt })),
      automated: decisions.filter((d) => d.userId === r.userId).slice(0, 5),
    })),
  });
}, { permission: "reports.resolve" });
