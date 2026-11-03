import { z } from "zod";
import { FEEDBACK_CONTEXTS, RATINGS, saveFeedback, shouldAsk } from "@/lib/feedback";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

/** Should the app ask "How was this?" here? (rarely — see shouldAsk) */
export const GET = route(async ({ req, user }) => {
  const context = new URL(req.url).searchParams.get("context") ?? "APP";
  if (!(FEEDBACK_CONTEXTS as readonly string[]).includes(context)) return ok({ ask: false });
  return ok({ ask: await shouldAsk(user.id, context) });
});

export const POST = route(async ({ req, user }) => {
  await rateLimit(`feedback:${user.id}`, 20, 86400_000);
  const b = await parseBody(req, z.object({
    context: z.enum(FEEDBACK_CONTEXTS), rating: z.enum(RATINGS), comment: z.string().max(1000).optional(),
    platform: z.enum(["ios", "android", "web", "website"]).optional(), appVersion: z.string().max(40).optional(),
  }));
  return ok({ saved: true, ...(await saveFeedback(user.id, b)) }, 201);
});
