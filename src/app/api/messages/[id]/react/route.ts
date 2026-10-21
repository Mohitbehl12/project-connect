import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { react } from "@/lib/chatMedia";

/** Puts a reaction (❤️ 😉 🔥 😍 ✨) on a message, changes it, or removes it. */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  await rateLimit(`react:${user.id}`, 120, 60_000);
  const { on, emoji } = await parseBody(req, z.object({ on: z.boolean(), emoji: z.string().max(8).optional() }));
  return ok(await react(user, params.id, on, emoji));
});
