import { Targeting, estimateReach, requireAdvertiser } from "@/lib/ads";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

/** Rough audience size (rounded; under 100 is never shown as a number). Not a promise of reach. */
export const POST = route(async ({ req, user }) => {
  await requireAdvertiser(user);
  await rateLimit(`ad-reach:${user.id}`, 60, 60 * 60_000);
  return ok(await estimateReach(await parseBody(req, Targeting)));
}, { allowOnboarding: true });
