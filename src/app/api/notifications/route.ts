import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

export const GET = route(async ({ user }) => {
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt)).limit(60);
  return ok({ notifications: rows.map(({ userId: _u, ...n }) => n) });
}, { allowSuspended: true });

/** Marks all as read. */
export const POST = route(async ({ user }) => {
  await db.update(schema.notifications).set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  return ok({ ok: true });
}, { allowSuspended: true });
