import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

/** Plans with the price for the user's country (falls back to the "*" default price). */
export const GET = route(async ({ user }) => {
  const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) });
  const country = profile?.country ?? "*";
  const plans = await db.select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(asc(schema.plans.sortOrder));
  const prices = await db.select().from(schema.planPrices).where(eq(schema.planPrices.active, true));
  return ok({
    current: { code: user.planCode, endsAt: user.planEndsAt },
    plans: plans.map((p) => {
      const price = prices.find((x) => x.planId === p.id && x.country === country) ?? prices.find((x) => x.planId === p.id && x.country === "*");
      return {
        code: p.code, name: p.name, features: JSON.parse(p.features),
        price: price ? { id: price.id, currency: price.currency, amountMinor: price.promoMinor ?? price.amountMinor, listMinor: price.amountMinor, durationDays: price.durationDays } : null,
      };
    }),
  });
});
