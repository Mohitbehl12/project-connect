import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, route } from "@/lib/http";
import { getConfig } from "@/lib/config";
import { PERSONALITY_REASON, alignedTraits, compatibilityBreakdown, eligibility } from "@/lib/matching";
import { isBlockedBetween, loadPerson } from "@/lib/people";
import { orderedPair } from "@/lib/matches";

/**
 * Per-factor compatibility with one person, for the breakdown screen.
 * Only for people the viewer could see in discovery, has a like from, or has matched with.
 */
export const GET = route<{ userId: string }>(async ({ user, params }) => {
  const notFound = new ApiError(404, "This profile isn't available.", "not_found");
  if (params.userId === user.id) throw notFound;
  if (await isBlockedBetween(user.id, params.userId)) throw notFound;
  const [me, other] = await Promise.all([loadPerson(user.id), loadPerson(params.userId)]);
  if (!me || !other || other.row.user.status !== "ACTIVE") throw notFound;

  const [a, b] = orderedPair(user.id, params.userId);
  const matched = await db.query.matches.findFirst({ where: and(eq(schema.matches.userAId, a), eq(schema.matches.userBId, b)) });
  const likedMe = await db.query.likes.findFirst({ where: and(eq(schema.likes.fromId, params.userId), eq(schema.likes.toId, user.id), or(eq(schema.likes.kind, "LIKE"), eq(schema.likes.kind, "PRIORITY"), eq(schema.likes.kind, "SPARK"))) });
  if (!matched && !likedMe && eligibility(me.person, other.person) !== null) throw notFound;

  const weights = await getConfig("matching.weights");
  const b2 = compatibilityBreakdown(me.person, other.person, weights);
  const connect = alignedTraits(me.person, other.person, 3);
  // The personality line in "reasons" says the same as "connect" — keep the more specific one.
  const personalityLines = new Set(Object.values(PERSONALITY_REASON));
  const reasons = connect.length ? b2.reasons.filter((r) => !personalityLines.has(r)) : b2.reasons;
  return ok({ ...b2, reasons, connect });
});
