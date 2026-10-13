import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { applyEvent, cancelSubscription, checkoutProvider, quoteFor, startCheckout } from "@/lib/billing";
import { ApiError, ok, parseBody, route } from "@/lib/http";

/**
 * Legacy one-step endpoint used by the web Plans page in TEST MODE: starts a checkout with the
 * test provider and completes it immediately. Real payments go through /api/billing/checkout and
 * the gateway webhook; this route refuses to run when a real gateway is configured.
 */
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), priceId: z.string().min(1), acceptTerms: z.boolean().optional() }),
  z.object({ action: z.literal("cancel") }),
]);

export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  if (b.action === "cancel") return ok(await cancelSubscription(user));
  if (checkoutProvider().name !== "MOCK") throw new ApiError(409, "Use the checkout flow to subscribe.", "use_checkout");
  const price = await db.query.planPrices.findFirst({ where: eq(schema.planPrices.id, b.priceId) });
  const plan = price && (await db.query.plans.findFirst({ where: eq(schema.plans.id, price.planId) }));
  if (!plan || plan.code === "FREE") throw new ApiError(404, "That plan isn't available.", "not_found");
  const quote = await quoteFor(user, plan.code);
  const r = await startCheckout(user, { planCode: plan.code, acceptTerms: b.acceptTerms ?? true, expectedTodayMinor: quote.todayMinor });
  await applyEvent({ t: "CAPTURED", providerPaymentId: `mock_pay_${crypto.randomUUID().slice(0, 12)}`, amountMinor: r.quote.todayMinor, currency: r.quote.currency, method: "upi", ourPaymentId: r.paymentId, internal: true });
  const fresh = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
  return ok({ subscribed: true, plan: plan.code, endsAt: fresh?.planEndsAt, provider: "MOCK", quote: r.quote }, 201);
});
