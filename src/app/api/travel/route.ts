import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { planFeatures } from "@/lib/config";
import { CITIES } from "@/lib/constants";
import { countryRules } from "@/lib/compliance";
import { ApiError, ok, parseBody, route } from "@/lib/http";

/**
 * Travel mode: for up to 14 days, discover and be discovered in another city (shown as "Visiting <city>").
 * Your home city stays on your profile. A plan feature (Premium Plus / VIP).
 */
export const PUT = route(async ({ req, user }) => {
  const b = await parseBody(req, z.object({ city: z.string().max(40).nullable(), days: z.number().int().min(1).max(14).default(7) }));
  if (b.city) {
    if (!CITIES[b.city]) throw new ApiError(422, "city: Pick a city from the list.", "validation");
    if (!(await countryRules(CITIES[b.city].country)).launchEnabled) throw new ApiError(422, "Kinara isn't available in that country yet.", "country_unavailable");
    const f = await planFeatures(user.planCode, user.planEndsAt);
    if (!f.travelMode) throw new ApiError(402, "Travel mode is part of Premium Plus.", "upgrade_required");
  }
  const travelUntil = b.city ? new Date(Date.now() + b.days * 86400_000) : null;
  await db.update(schema.preferences).set({ travelCity: b.city, travelUntil }).where(eq(schema.preferences.userId, user.id));
  await audit(user.id, b.city ? "travel.on" : "travel.off", "user", user.id, { city: b.city });
  return ok({ city: b.city, until: travelUntil });
});
