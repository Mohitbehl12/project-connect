import { seal } from "@/lib/crypto";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { requireMatch } from "@/lib/matches";
import { DATE_KINDS } from "@/lib/constants";
import { DateBody, validatePlace } from "@/lib/dates";
import { notify } from "@/lib/notify";

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const { match, otherId } = await requireMatch(params.id, user.id);
  const b = await parseBody(req, DateBody);
  validatePlace(b.place);
  const startsAt = new Date(b.startsAt);
  if (startsAt.getTime() < Date.now() + 30 * 60_000) throw new ApiError(422, "startsAt: Pick a time at least 30 minutes from now.", "validation");
  if (startsAt.getTime() > Date.now() + 90 * 86400_000) throw new ApiError(422, "startsAt: Pick a date within the next 90 days.", "validation");

  const [plan] = await db.insert(schema.datePlans).values({
    matchId: match.id, proposerId: user.id, kind: b.kind, place: b.place, startsAt, note: b.note,
  }).returning();
  await db.insert(schema.messages).values({ matchId: match.id, senderId: user.id, kind: "SYSTEM", body: seal(`Suggested a date: ${DATE_KINDS[b.kind as keyof typeof DATE_KINDS]} at ${b.place}`, match.id) });
  await notify(otherId, "DATE", "New date suggestion", `${DATE_KINDS[b.kind as keyof typeof DATE_KINDS]} at ${b.place}`, `/matches/${match.id}`);
  return ok({ id: plan.id }, 201);
});
