import { z } from "zod";
import { callEligibility } from "@/lib/calls";
import { createCallRequest } from "@/lib/callRequests";
import { ok, parseBody, route } from "@/lib/http";

const Body = z.object({ matchId: z.string().max(64).optional(), userId: z.string().max(64).optional(), kind: z.enum(["AUDIO", "VIDEO"]).default("VIDEO") })
  .refine((b) => b.matchId || b.userId, "matchId: Say who you'd like to call");

/** Asks a match for permission to call. Nobody can be called without accepting first. */
export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  return ok({ request: await createCallRequest(user, b, callEligibility) }, 201);
});
