import { z } from "zod";
import { callEligibility, callView, iceConfig, startCall } from "@/lib/calls";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Whether the call buttons in this chat are available, and why not. */
export const GET = route<{ id: string }>(async ({ user, params }) => {
  const e = await callEligibility(params.id, user.id);
  return ok({ canCall: e.ok, reason: e.reason, code: e.code });
});

const Body = z.object({ kind: z.enum(["AUDIO", "VIDEO"]) });

/** Rings the other person. */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  rateLimit(`call:${user.id}`, 10, 10 * 60_000);
  const { kind } = await parseBody(req, Body);
  const c = await startCall(user, params.id, kind);
  return ok({ call: callView(c, user.id), ice: iceConfig(user.id) }, 201);
});
