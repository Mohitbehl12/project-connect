import { ok, route } from "@/lib/http";
import { catalogue } from "@/lib/billing";

/**
 * Plans with the price that applies to this person (country and price group), today's offer and
 * the full renewal terms. Kept for the web Plans page; the app uses /api/billing/catalogue.
 */
export const GET = route(async ({ user }) => {
  const c = await catalogue(user);
  return ok({
    current: { code: user.planCode, endsAt: user.planEndsAt },
    subscription: c.subscription,
    plans: [
      { code: "FREE", name: "Free", features: null, price: null, quote: null },
      ...c.plans.map((p) => ({
        code: p.code, name: p.name, features: p.features, quote: p.quote,
        price: { id: p.quote.priceId, currency: p.quote.currency, amountMinor: p.quote.todayMinor, listMinor: p.quote.regularMinor, durationDays: p.quote.periodDays },
      })),
    ],
    passes: c.passes,
  });
});
