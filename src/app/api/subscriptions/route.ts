import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";

/**
 * MOCK CHECKOUT — activates immediately without taking payment, for testing only.
 * Production flow: create a Razorpay (India) / Stripe (elsewhere) order here, return it to the client,
 * and activate the subscription only from the provider's signed webhook. On iOS/Android, digital
 * subscriptions must go through Apple/Google in-app purchase and be validated server-side.
 */
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), priceId: z.string().min(1) }),
  z.object({ action: z.literal("cancel") }),
]);

export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);

  if (b.action === "cancel") {
    const active = await db.query.subscriptions.findFirst({ where: and(eq(schema.subscriptions.userId, user.id), eq(schema.subscriptions.status, "ACTIVE")) });
    if (!active) throw new ApiError(404, "You don't have an active subscription.", "none");
    await db.update(schema.subscriptions).set({ status: "CANCELLED" }).where(eq(schema.subscriptions.id, active.id));
    await audit(user.id, "subscription.cancel", "subscription", active.id);
    await notify(user.id, "SUBSCRIPTION", "Subscription cancelled", `You'll keep your benefits until ${active.endsAt.toDateString()}.`);
    return ok({ cancelled: true, accessUntil: active.endsAt });
  }

  if (process.env.NODE_ENV === "production" && process.env.ENABLE_MOCK_PAYMENTS !== "true")
    throw new ApiError(503, "Payments aren't set up yet.", "payments_disabled");

  const price = await db.query.planPrices.findFirst({ where: eq(schema.planPrices.id, b.priceId) });
  if (!price || !price.active) throw new ApiError(404, "That plan isn't available.", "not_found");
  const plan = await db.query.plans.findFirst({ where: eq(schema.plans.id, price.planId) });
  if (!plan || plan.code === "FREE") throw new ApiError(404, "That plan isn't available.", "not_found");

  const endsAt = new Date(Date.now() + price.durationDays * 86400_000);
  await db.update(schema.subscriptions).set({ status: "CANCELLED" })
    .where(and(eq(schema.subscriptions.userId, user.id), eq(schema.subscriptions.status, "ACTIVE")));
  const [sub] = await db.insert(schema.subscriptions).values({
    userId: user.id, planCode: plan.code, priceId: price.id, provider: "MOCK", endsAt,
    amountMinor: price.promoMinor ?? price.amountMinor, currency: price.currency,
  }).returning();
  await db.update(schema.users).set({ planCode: plan.code, planEndsAt: endsAt }).where(eq(schema.users.id, user.id));
  await audit(user.id, "subscription.start", "subscription", sub.id, { plan: plan.code, provider: "MOCK" });
  await notify(user.id, "SUBSCRIPTION", `${plan.name} is active`, `Your benefits are on until ${endsAt.toDateString()}.`, "/plans");
  return ok({ subscribed: true, plan: plan.code, endsAt, provider: "MOCK" }, 201);
});
