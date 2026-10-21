import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, route } from "@/lib/http";
import { eligibility, scorePair } from "@/lib/matching";
import { getConfig } from "@/lib/config";
import { isBlockedBetween, loadPerson, publicCard } from "@/lib/people";
import { orderedPair } from "@/lib/matches";
import { photosFor } from "@/lib/photos";

/**
 * One person's public card — the same safe shape as Discover — for opening a profile from a link, a
 * notification or after the app restarts. Only for matches, people who liked you, or people you could see
 * in Discover anyway (same privacy rules).
 */
export const GET = route<{ id: string }>(async ({ user, params }) => {
  const notFound = new ApiError(404, "This profile isn't available any more.", "not_found");
  if (params.id === user.id || (await isBlockedBetween(user.id, params.id))) throw notFound;
  const [me, other] = await Promise.all([loadPerson(user.id), loadPerson(params.id)]);
  if (!me || !other) throw notFound;
  const u = other.row.user, pr = other.row.prefs;
  if (u.status !== "ACTIVE" || u.role !== "USER" || u.onboardingStep < 3 || u.deactivatedAt) throw notFound;

  const [a, b] = orderedPair(user.id, params.id);
  const match = await db.query.matches.findFirst({ where: and(eq(schema.matches.userAId, a), eq(schema.matches.userBId, b), eq(schema.matches.status, "ACTIVE")) });
  const likedMe = await db.query.likes.findFirst({ where: and(eq(schema.likes.fromId, params.id), eq(schema.likes.toId, user.id), inArray(schema.likes.kind, ["LIKE", "PRIORITY", "SPARK"])) });
  if (!match && !likedMe) {
    const hidden = u.restrictedAt || pr?.discoverable === false || pr?.incognito
      || (pr?.profileVisibility === "VERIFIED" && user.selfieStatus !== "VERIFIED") || (pr?.likesFrom === "VERIFIED" && user.selfieStatus !== "VERIFIED");
    if (hidden || eligibility(me.person, other.person) !== null) throw notFound;
  }
  const s = scorePair(me.person, other.person, await getConfig("matching.weights"));
  const photos = (await photosFor([params.id])).get(params.id);
  return ok({ card: publicCard(me.person, other.row, { score: s.score, reasons: s.reasons, photos, matched: !!match }), matchId: match?.id ?? null });
});
