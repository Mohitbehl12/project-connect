import { z } from "zod";
import { callEligibility, callView, iceConfig, startCall } from "@/lib/calls";
import { callRequestState } from "@/lib/callRequests";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Whether the call buttons in this chat are available, and why not. */
export const GET = route<{ id: string }>(async ({ user, params }) => {
  const e = await callEligibility(params.id, user.id);
  const r = await callRequestState(e.match.id, user.id, e.otherId);
  // Requests can be sent when the only thing missing is consent.
  return ok({ ...r, canCall: e.ok, reason: e.reason, code: e.code, canRequest: r.canRequest && (e.ok || e.code === "needs_request") });
});

const Body = z.object({ kind: z.enum(["AUDIO", "VIDEO"]) });

/** Rings the other person. */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  await rateLimit(`call:${user.id}`, 10, 10 * 60_000);
  const { kind } = await parseBody(req, Body);
  const c = await startCall(user, params.id, kind);
  return ok({ call: callView(c, user.id), ice: await iceConfig(user.id) }, 201);
});
