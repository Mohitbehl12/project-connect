import { z } from "zod";
import { actOnCall, callView, iceConfig, pollCall } from "@/lib/calls";
import { ok, parseBody, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Long poll during a call: state changes and connection signals from the other person. ?after=<seq>&wait=<ms>&ice=1 */
export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const u = new URL(req.url);
  const after = Number(u.searchParams.get("after") ?? 0) || 0;
  const wait = Math.min(20_000, Math.max(0, Number(u.searchParams.get("wait") ?? 20_000)));
  const r = await pollCall(user, params.id, after, wait, req.signal);
  return ok(u.searchParams.get("ice") === "1" ? { ...r, ice: await iceConfig(user.id) } : r);
});

const Body = z.object({ action: z.enum(["accept", "decline", "end"]) });

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const { action } = await parseBody(req, Body);
  const c = await actOnCall(user, params.id, action);
  return ok({ call: callView(c, user.id), ice: action === "accept" ? await iceConfig(user.id) : undefined });
});
