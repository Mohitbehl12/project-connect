import { z } from "zod";
import { actOnCheckin } from "@/lib/checkins";
import { ok, parseBody, route } from "@/lib/http";

/** I'm safe · add time · cancel. */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, z.object({ action: z.enum(["safe", "extend", "cancel"]), minutes: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)]).default(30) }));
  return ok({ checkin: await actOnCheckin(user.id, params.id, b.action, b.minutes) });
}, { allowSuspended: true });
