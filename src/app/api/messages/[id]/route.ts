import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, route } from "@/lib/http";
import { bumpChat } from "@/lib/realtime";

/**
 * Deletes a message for both people. The text is hidden from users but retained for 90 days
 * for safety investigations (disclosed in the Privacy Policy); a scheduled job should purge it after.
 */
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const msg = await db.query.messages.findFirst({ where: eq(schema.messages.id, params.id) });
  if (!msg || msg.senderId !== user.id) throw new ApiError(404, "Message not found.", "not_found");
  if (!msg.deletedAt) { await db.update(schema.messages).set({ deletedAt: new Date() }).where(eq(schema.messages.id, msg.id)); bumpChat(msg.matchId); }
  return ok({ deleted: true });
});
