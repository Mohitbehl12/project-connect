import { MODES, discover, filtersFrom, type Mode } from "@/lib/discover";
import { ok, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

/** Discover deck, Explore collections (?cat=) and search (?q=&interests=&city=&ageMin=…). */
export const GET = route(async ({ req, user }) => {
  const url = new URL(req.url);
  const sp = url.searchParams;
  if (sp.get("q")) await rateLimit(`search:${user.id}`, 120, 60 * 60_000);
  const mode = (MODES.includes(sp.get("mode") as Mode) ? sp.get("mode") : "recommended") as Mode;
  const r = await discover(user, { mode, cat: sp.get("cat") ?? undefined, filters: filtersFrom(sp) });
  return ok(r);
});
