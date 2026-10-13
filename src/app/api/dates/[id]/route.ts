import { seal } from "@/lib/crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { requireMatch } from "@/lib/matches";
import { notify } from "@/lib/notify";
import { validatePlace } from "@/lib/dates";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("reschedule"), startsAt: z.string().datetime({ offset: true }), place: z.string().trim().min(2).max(120).optional() }),
]);

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const plan = await db.query.datePlans.findFirst({ where: eq(schema.datePlans.id, params.id) });
  if (!plan) throw new ApiError(404, "Date plan not found.", "not_found");
  const { match, otherId } = await requireMatch(plan.matchId, user.id);
  const b = await parseBody(req, Body);
  if (plan.status === "CANCELLED") throw new ApiError(409, "This plan was cancelled.", "cancelled");

  let summary = "";
  if (b.action === "confirm") {
    if (plan.proposerId === user.id) throw new ApiError(403, "The other person needs to confirm your suggestion.", "own_plan");
    await db.update(schema.datePlans).set({ status: "CONFIRMED", updatedAt: new Date() }).where(eq(schema.datePlans.id, plan.id));
    summary = "Confirmed the date";
  } else if (b.action === "cancel") {
    await db.update(schema.datePlans).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(schema.datePlans.id, plan.id));
    summary = "Cancelled the date";
  } else {
    const startsAt = new Date(b.startsAt);
    if (startsAt.getTime() < Date.now() + 30 * 60_000) throw new ApiError(422, "startsAt: Pick a time at least 30 minutes from now.", "validation");
    if (b.place) validatePlace(b.place);
    // Rescheduling hands the plan back to the other person to confirm.
    await db.update(schema.datePlans).set({ status: "PROPOSED", startsAt, place: b.place ?? plan.place, proposerId: user.id, updatedAt: new Date() })
      .where(eq(schema.datePlans.id, plan.id));
    summary = "Suggested a new time for the date";
  }
  await db.insert(schema.messages).values({ matchId: match.id, senderId: user.id, kind: "SYSTEM", body: seal(summary, match.id) });
  await notify(otherId, "DATE", summary, plan.place, `/matches/${match.id}`);
  return ok({ updated: true });
});
