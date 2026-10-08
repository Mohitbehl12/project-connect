import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { requireMatch } from "@/lib/matches";
import { audit } from "@/lib/audit";

/** Ends the match quietly — the other person is not notified, the conversation disappears for both. */
export const POST = route<{ id: string }>(async ({ user, params }) => {
  const { match } = await requireMatch(params.id, user.id);
  await db.update(schema.matches).set({ status: "UNMATCHED", unmatchedBy: user.id }).where(eq(schema.matches.id, match.id));
  await db.update(schema.datePlans).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(schema.datePlans.matchId, match.id));
  await audit(user.id, "match.unmatch", "match", match.id);
  return ok({ unmatched: true });
}, { allowSuspended: true });
