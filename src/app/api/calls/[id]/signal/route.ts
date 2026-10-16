import { z } from "zod";
import { sendSignal } from "@/lib/calls";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

/** Relays one WebRTC setup message (offer, answer or network candidate) to the other person. */
const Body = z.object({ type: z.enum(["offer", "answer", "ice"]), data: z.unknown() });

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  await rateLimit(`signal:${user.id}`, 300, 60_000);
  const b = await parseBody(req, Body);
  return ok(await sendSignal(user, params.id, b.type, b.data));
});
