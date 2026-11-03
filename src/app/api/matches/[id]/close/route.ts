import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { endCallsBetween } from "@/lib/calls";
import { purgeEndedChatMedia } from "@/lib/chatMedia";
import { CLOSING_NOTES, type ClosingNote } from "@/lib/closeKindly";
import { ok, parseBody, route } from "@/lib/http";
import { requireMatch } from "@/lib/matches";
import { notify } from "@/lib/notify";

/**
 * Close a conversation kindly: the other person gets a short, pre-written goodbye in their notifications instead
 * of silence, then the match ends exactly like an unmatch. Nobody is shamed for going quiet.
 */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, z.object({ note: z.enum(Object.keys(CLOSING_NOTES) as [ClosingNote, ...ClosingNote[]]) }));
  const { match, otherId } = await requireMatch(params.id, user.id);
  const me = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id), columns: { firstName: true } });
  await db.update(schema.matches).set({ status: "UNMATCHED", unmatchedBy: user.id, endedAt: new Date() }).where(eq(schema.matches.id, match.id));
  await db.update(schema.datePlans).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(schema.datePlans.matchId, match.id));
  await notify(otherId, "MATCH", `${me?.firstName ?? "Your match"} said goodbye`, CLOSING_NOTES[b.note], "/matches");
  await audit(user.id, "match.close_kindly", "match", match.id, { note: b.note });
  await endCallsBetween(user.id, otherId);
  await purgeEndedChatMedia([match.id]);
  return ok({ closed: true });
}, { allowSuspended: true });
