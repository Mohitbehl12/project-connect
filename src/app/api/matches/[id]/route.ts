import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, route } from "@/lib/http";
import { requireMatch } from "@/lib/matches";
import { loadPerson, publicCard } from "@/lib/people";
import { conversationStarters } from "@/lib/starters";
import { photosFor } from "@/lib/photos";
import { alignedTraits } from "@/lib/matching";

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const { match, otherId } = await requireMatch(params.id, user.id);
  const [me, other] = await Promise.all([loadPerson(user.id), loadPerson(otherId)]);
  if (!me || !other || other.row.user.status === "BANNED") throw new ApiError(410, "This person is no longer available.", "gone");

  const photoMap = await photosFor([otherId]);
  const card = publicCard(me.person, other.row, { score: match.score, reasons: JSON.parse(match.reasons), photos: photoMap.get(otherId) });
  const online = other.row.prefs?.showOnline !== false && Date.now() - other.row.user.lastActiveAt.getTime() < 5 * 60_000;
  const dates = await db.select().from(schema.datePlans).where(eq(schema.datePlans.matchId, match.id)).orderBy(asc(schema.datePlans.startsAt));
  return ok({
    match: { id: match.id, score: match.score, createdAt: match.createdAt },
    other: { ...card, online },
    connect: alignedTraits(me.person, other.person, 3),
    starters: conversationStarters(
      { interests: me.person.interests, city: me.person.city },
      { interests: other.person.interests, city: other.person.city, prompts: card.prompts, firstName: card.firstName },
    ),
    dates: dates.map((d) => ({ ...d, mine: d.proposerId === user.id, proposerId: undefined })),
  });
});
