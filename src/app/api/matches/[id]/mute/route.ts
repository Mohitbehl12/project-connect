import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, parseBody, route } from "@/lib/http";
import { isMuted, requireMatch } from "@/lib/matches";

/** Mute or unmute notifications for one chat. The other person is not told. */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const { match } = await requireMatch(params.id, user.id, { allowEnded: true });
  const { muted } = await parseBody(req, z.object({ muted: z.boolean() }));
  if (muted) await db.insert(schema.chatMutes).values({ userId: user.id, matchId: match.id }).onConflictDoNothing();
  else await db.delete(schema.chatMutes).where(and(eq(schema.chatMutes.userId, user.id), eq(schema.chatMutes.matchId, match.id)));
  return ok({ muted: await isMuted(user.id, match.id) });
});
