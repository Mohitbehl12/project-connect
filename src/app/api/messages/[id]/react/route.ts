import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { react } from "@/lib/chatMedia";

/** Puts a heart on a message, or removes it. */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  await rateLimit(`react:${user.id}`, 120, 60_000);
  const { on } = await parseBody(req, z.object({ on: z.boolean() }));
  return ok(await react(user, params.id, on));
});
