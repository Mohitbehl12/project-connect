import { z } from "zod";
import { ok, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { searchPlaces } from "@/lib/places";

/** City search for "Where are you based?" and travel mode: every town and city in the world. */
export const GET = route(async ({ req, user }) => {
  await rateLimit(`places:${user.id}`, 300, 60 * 60_000);
  const sp = new URL(req.url).searchParams;
  const q = z.string().trim().max(80).parse(sp.get("q") ?? "");
  const country = sp.get("country");
  const places = q.length < 2 ? [] : searchPlaces(q, { country: country && /^[A-Z]{2}$/.test(country) ? country : undefined, limit: 20 });
  return ok({ places: places.map(({ key, label, name, region, country, countryName }) => ({ key, label, name, region, country, countryName })) });
}, { allowOnboarding: true, allowSuspended: true });
