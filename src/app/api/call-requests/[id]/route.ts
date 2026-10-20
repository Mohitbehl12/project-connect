import { z } from "zod";
import { respondToCallRequest } from "@/lib/callRequests";
import { ok, parseBody, route } from "@/lib/http";

/** accept / decline (the person asked) · cancel (the person asking) · revoke (stop allowing calls). */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const { action } = await parseBody(req, z.object({ action: z.enum(["accept", "decline", "cancel", "revoke"]) }));
  return ok(await respondToCallRequest(user, params.id, action));
});
