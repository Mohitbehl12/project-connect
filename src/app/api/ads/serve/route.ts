import { PLACEMENTS, pickAd, type Placement } from "@/lib/ads";
import { getConfig } from "@/lib/config";
import { ApiError, ok, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

/** One ad for a placement (or null). Ads are never served for chats or calls. */
export const GET = route(async ({ req, user }) => {
  if (user.role !== "USER") return ok({ ad: null });
  await rateLimit(`ad-serve:${user.id}`, 120, 60 * 60_000);
  const url = new URL(req.url);
  const placement = url.searchParams.get("placement") as Placement;
  if (!placement || !(placement in PLACEMENTS) || placement === "HOME") throw new ApiError(422, "placement: unknown placement.", "validation");
  const device = req.headers.get("x-platform") ?? "web";
  const language = (req.headers.get("accept-language") ?? "en").slice(0, 2) === "hi" ? "hi" : "en";
  const exclude = (url.searchParams.get("exclude") ?? "").split(",").filter((x) => /^[\w-]{1,64}$/.test(x)).slice(0, 10);
  const ad = await pickAd(user, placement, ["ios", "android"].includes(device) ? device : "web", language, exclude);
  // Discover shows at most one sponsored card every N profiles (admin setting).
  return ok({ ad: ad && placement === "DISCOVER" ? { ...ad, every: await getConfig("ads.discoverEvery") } : ad });
});
