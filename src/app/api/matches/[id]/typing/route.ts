import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { requireMatch } from "@/lib/matches";
import { rateLimit } from "@/lib/ratelimit";
import { setTyping } from "@/lib/realtime";

const Body = z.object({ typing: z.boolean() });

/** "…is typing". Sent at most every few seconds while the person types; it fades out by itself. */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  rateLimit(`typing:${user.id}`, 60, 60_000);
  const { match } = await requireMatch(params.id, user.id);
  setTyping(match.id, user.id, (await parseBody(req, Body)).typing);
  return ok({ ok: true });
});
