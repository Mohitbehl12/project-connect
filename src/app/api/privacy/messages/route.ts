import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { deleteMyMessages } from "@/lib/privacy";

/** Delete the messages I sent — in one conversation, or everywhere. */
export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, z.object({ matchId: z.string().min(1).optional() }));
  return ok({ deleted: await deleteMyMessages(user, b.matchId) });
});
