import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, route } from "@/lib/http";

/** Undo the most recent pass (within 10 minutes). Free for everyone — second chances shouldn't be a paywall. */
export const POST = route(async ({ user }) => {
  const last = await db.query.likes.findFirst({
    where: and(eq(schema.likes.fromId, user.id), gte(schema.likes.createdAt, new Date(Date.now() - 10 * 60_000))),
    orderBy: desc(schema.likes.createdAt),
  });
  if (!last || last.kind !== "PASS") throw new ApiError(404, "There's nothing to undo.", "nothing_to_undo");
  await db.delete(schema.likes).where(eq(schema.likes.id, last.id));
  return ok({ restoredUserId: last.toId });
});
