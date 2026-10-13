import "server-only";
import { and, desc, eq, inArray, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "./audit";
import { getConfig, type PlanFeatures } from "./config";
import { ApiError } from "./http";
import { notify } from "./notify";
import { mockProvider } from "./payments/mock";
import { razorpayProvider } from "./payments/razorpay";
import { friendlyFailure, type BillingEvent, type PaymentProvider } from "./payments/types";
import { buildQuote, eligibleOffers, formatDate, formatMoney, pickPrice, planName, type Buyer, type OfferRow, type PriceRow, type Quote } from "./pricing";
import { addRiskSignal } from "./risk";

const DAY = 86_400_000;
const LIVE = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"] as const; // statuses that can still grant access

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export function mockAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_MOCK_PAYMENTS === "true";
}

/** Which gateway new checkouts use: BILLING_PROVIDER=razorpay with keys set, otherwise the test provider. */
export function checkoutProvider(): PaymentProvider {
  if (process.env.BILLING_PROVIDER === "razorpay" && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return razorpayProvider;
  if (!mockAllowed()) throw new ApiError(503, "Payments aren't set up yet. Please try again later.", "payments_disabled");
  return mockProvider;
}

export function providerByName(name: string): PaymentProvider | null {
  if (name === "RAZORPAY") return razorpayProvider;
  if (name === "MOCK" || name === "REWARD") return mockProvider;
  return null;
}

// ---------------------------------------------------------------------------
// Buyer + catalogue
// ---------------------------------------------------------------------------

export async function loadBuyer(user: User): Promise<Buyer> {
  const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) });
  const subs = await db.select().from(schema.subscriptions).where(and(eq(schema.subscriptions.userId, user.id), ne(schema.subscriptions.provider, "REWARD")));
  const now = Date.now();
  const activeNow = subs.some((s) => (LIVE as readonly string[]).includes(s.status) && s.endsAt.getTime() > now);
  const paidOffers = await db.select({ offerId: schema.payments.offerId }).from(schema.payments)
    .where(and(eq(schema.payments.userId, user.id), inArray(schema.payments.status, ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"]), isNotNull(schema.payments.offerId)));
  const usedOfferIds = [...new Set(paidOffers.map((p) => p.offerId!))];

  // Intro offers are once per person: check this account and any account sharing its phone or app install.
  const introOffers = await db.select({ id: schema.offers.id }).from(schema.offers).where(eq(schema.offers.kind, "INTRO"));
  const introIds = introOffers.map((o) => o.id);
  let introUsed = usedOfferIds.some((id) => introIds.includes(id));
  if (!introUsed && introIds.length && (user.signupInstallId || user.phone)) {
    const twins = await db.select({ id: schema.users.id }).from(schema.users).where(and(ne(schema.users.id, user.id), or(
      user.signupInstallId ? eq(schema.users.signupInstallId, user.signupInstallId) : sql`0`,
      user.phone ? eq(schema.users.phone, user.phone) : sql`0`,
    )));
    if (twins.length) {
      const reused = await db.select({ id: schema.payments.id }).from(schema.payments).where(and(
        inArray(schema.payments.userId, twins.map((t) => t.id)), inArray(schema.payments.offerId, introIds), inArray(schema.payments.status, ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"]),
      )).limit(1);
      introUsed = reused.length > 0;
    }
  }

  const redemptions = await db.select({ couponId: schema.couponRedemptions.couponId, n: sql<number>`count(*)` })
    .from(schema.couponRedemptions).where(eq(schema.couponRedemptions.userId, user.id)).groupBy(schema.couponRedemptions.couponId);

  return {
    gender: profile?.gender ?? null,
    country: profile?.country ?? "IN",
    everPaid: (await db.select({ id: schema.payments.id }).from(schema.payments).where(and(eq(schema.payments.userId, user.id), eq(schema.payments.status, "CAPTURED"))).limit(1)).length > 0,
    activeNow,
    introUsed,
    usedOfferIds,
    couponUses: Object.fromEntries(redemptions.map((r) => [r.couponId, Number(r.n)])),
  };
}

async function priceRows(): Promise<(PriceRow & { providerPlanId: string | null })[]> {
  const rows = await db.select({ p: schema.planPrices, code: schema.plans.code })
    .from(schema.planPrices).innerJoin(schema.plans, eq(schema.plans.id, schema.planPrices.planId))
    .where(and(eq(schema.planPrices.active, true), eq(schema.plans.active, true)));
  return rows.map(({ p, code }) => ({ ...p, planCode: code }));
}

async function offerRows(): Promise<OfferRow[]> {
  return db.select().from(schema.offers).where(eq(schema.offers.active, true));
}

async function couponByCode(code: string) {
  return (await db.query.coupons.findFirst({ where: eq(schema.coupons.code, code.trim().toUpperCase()) })) ?? null;
}

export async function quoteFor(user: User, planCode: string, opts: { coupon?: string | null; offerId?: string | null } = {}): Promise<Quote> {
  const [buyer, prices, offers, genderCountries, reminderDays] = await Promise.all([
    loadBuyer(user), priceRows(), offerRows(), getConfig("billing.genderPricingCountries"), getConfig("billing.reminderDays"),
  ]);
  const price = pickPrice(prices, planCode, buyer, genderCountries);
  if (!price || planCode === "FREE") throw new ApiError(404, "That plan isn't available in your country.", "not_found");
  const now = new Date();
  const eligible = eligibleOffers(offers, planCode, buyer, now, genderCountries);
  let offer: OfferRow | null;
  if (opts.offerId) {
    offer = eligible.find((o) => o.id === opts.offerId) ?? null;
    if (!offer) throw new ApiError(410, "That offer isn't available on your account any more.", "offer_unavailable");
  } else {
    offer = eligible.find((o) => o.kind !== "PASS") ?? null;
  }
  const coupon = opts.coupon?.trim() ? { row: await couponByCode(opts.coupon), code: opts.coupon.trim() } : null;
  return buildQuote({ price, offer, coupon, buyer, now, genderCountries, reminderDays });
}

/** Everything the Premium screen needs: plans with personalised quotes, passes, and current status. */
export async function catalogue(user: User) {
  const plans = await db.select().from(schema.plans).where(and(eq(schema.plans.active, true), ne(schema.plans.code, "FREE"))).orderBy(schema.plans.sortOrder);
  const out = [];
  for (const p of plans) {
    try {
      const quote = await quoteFor(user, p.code);
      out.push({ code: p.code, name: p.name, features: JSON.parse(p.features) as PlanFeatures, quote });
    } catch { /* plan not sold in this country */ }
  }
  const [buyer, offers, genderCountries, reminderDays, prices] = await Promise.all([loadBuyer(user), offerRows(), getConfig("billing.genderPricingCountries"), getConfig("billing.reminderDays"), priceRows()]);
  const passes: Quote[] = [];
  for (const p of plans) {
    const price = pickPrice(prices, p.code, buyer, genderCountries);
    if (!price) continue;
    for (const o of eligibleOffers(offers, p.code, buyer, new Date(), genderCountries).filter((x) => x.kind === "PASS"))
      passes.push(buildQuote({ price, offer: o, buyer, now: new Date(), genderCountries, reminderDays }));
  }
  return { plans: out, passes, subscription: await subscriptionSummary(user.id), provider: checkoutProviderName(), appleIap: { enabled: false } };
}

function checkoutProviderName() {
  try { return checkoutProvider().name; } catch { return "NONE"; }
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export async function startCheckout(user: User, input: { planCode: string; offerId?: string | null; coupon?: string | null; acceptTerms: boolean; expectedTodayMinor: number }) {
  if (!input.acceptTerms) throw new ApiError(422, "Please confirm you understand the subscription terms.", "terms_required");
  if (user.riskLevel === "HIGH" && user.selfieStatus !== "VERIFIED")
    throw new ApiError(403, "For your security, please complete selfie verification before subscribing.", "verification_required");
  const quote = await quoteFor(user, input.planCode, { coupon: input.coupon, offerId: input.offerId });
  if (input.coupon && quote.couponError) throw new ApiError(422, quote.couponError, "coupon_invalid");
  if (quote.todayMinor !== input.expectedTodayMinor)
    throw new ApiError(409, "The price changed since you opened this screen. Please review it again.", "price_changed");

  const live = await liveSubscription(user.id);
  if (live && live.provider !== "REWARD" && live.kind === "RECURRING" && quote.kind === "RECURRING")
    throw new ApiError(409, "You already have an active plan. You can change plans from My Subscription.", "already_subscribed");

  const provider = checkoutProvider();
  const now = new Date();
  // Abandoned checkouts are closed so only one is ever pending: their payments can no longer settle
  // (a late capture is refunded, see activateClaimed) and their gateway mandates are cancelled.
  const stale = await db.select().from(schema.subscriptions).where(and(eq(schema.subscriptions.userId, user.id), eq(schema.subscriptions.status, "PENDING")));
  for (const st of stale) {
    if (st.providerRef && st.kind === "RECURRING" && st.provider === "RAZORPAY") await razorpayProvider.cancelAtCycleEnd(st.providerRef).catch(() => {});
    await db.update(schema.subscriptions).set({ status: "EXPIRED", endsAt: now }).where(eq(schema.subscriptions.id, st.id));
    await db.update(schema.payments).set({ status: "FAILED", failureCode: "REPLACED", failureReason: "You started a new checkout." }).where(and(eq(schema.payments.subscriptionId, st.id), eq(schema.payments.status, "CREATED")));
  }

  const [sub] = await db.insert(schema.subscriptions).values({
    userId: user.id, planCode: quote.planCode, priceId: quote.priceId, provider: provider.name, status: "PENDING",
    kind: quote.kind, amountMinor: quote.kind === "PASS" ? quote.todayMinor : quote.regularMinor, currency: quote.currency,
    periodDays: quote.periodDays, offerId: quote.offer?.id ?? null, couponCode: quote.coupon?.code ?? null,
    introEndsAt: quote.introDays ? quote.nextChargeAt : null, nextChargeAt: quote.nextChargeAt, nextChargeMinor: quote.nextChargeMinor,
    termsAcceptedAt: now, endsAt: now,
  }).returning();
  const [payment] = await db.insert(schema.payments).values({
    userId: user.id, subscriptionId: sub.id, provider: provider.name, purpose: quote.kind === "PASS" ? "PASS" : "INITIAL",
    amountMinor: quote.todayMinor, currency: quote.currency, planCode: quote.planCode, offerId: quote.offer?.id ?? null,
    couponCode: quote.coupon?.code ?? null, discountMinor: quote.discountMinor,
  }).returning();

  const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) });
  const price = await db.query.planPrices.findFirst({ where: eq(schema.planPrices.id, quote.priceId) });
  const session = await provider.createCheckout({
    ourPaymentId: payment.id, ourSubscriptionId: sub.id, kind: quote.kind, planCode: quote.planCode, planName: planName(quote.planCode),
    currency: quote.currency, todayMinor: quote.todayMinor, regularMinor: quote.regularMinor, periodDays: quote.periodDays,
    firstChargeAt: quote.nextChargeAt, providerPlanId: price?.providerPlanId ?? null,
    customer: { name: profile?.firstName ?? "", email: user.email, phone: user.phone },
  });
  await db.update(schema.subscriptions).set({ providerRef: session.providerRef }).where(eq(schema.subscriptions.id, sub.id));
  if (session.providerOrderId) await db.update(schema.payments).set({ providerOrderId: session.providerOrderId }).where(eq(schema.payments.id, payment.id));
  if (session.providerPlanId && price) await db.update(schema.planPrices).set({ providerPlanId: session.providerPlanId }).where(eq(schema.planPrices.id, price.id));
  await audit(user.id, "billing.checkout", "payment", payment.id, { plan: quote.planCode, today: quote.todayMinor, offer: quote.offer?.id, coupon: quote.coupon?.code, provider: provider.name });
  return { paymentId: payment.id, subscriptionId: sub.id, provider: provider.name, client: session.client, quote };
}

// ---------------------------------------------------------------------------
// Gateway events → our records (the only path that grants Premium)
// ---------------------------------------------------------------------------

async function nextInvoiceNo(at: Date) {
  const y = at.getUTCFullYear(), m = at.getUTCMonth();
  const start = m >= 3 ? y : y - 1; // Indian financial year: April–March
  const fy = `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  const [row] = await db.insert(schema.invoiceCounters).values({ fy, last: 1 })
    .onConflictDoUpdate({ target: schema.invoiceCounters.fy, set: { last: sql`${schema.invoiceCounters.last} + 1` } }).returning();
  return `PC/${fy}/${String(row.last).padStart(6, "0")}`;
}

/** Recomputes a person's plan from their subscriptions. The single place users.planCode is written for billing. */
export async function syncUserPlan(userId: string) {
  const graceDays = await getConfig("billing.graceDays");
  const subs = await db.select().from(schema.subscriptions).where(and(eq(schema.subscriptions.userId, userId), inArray(schema.subscriptions.status, [...LIVE])));
  const now = Date.now();
  const rank = (c: string) => ({ VIP: 3, PREMIUM_PLUS: 2, PREMIUM: 1 }[c] ?? 0);
  let best: { code: string; endsAt: Date } | null = null;
  for (const s of subs) {
    const until = s.status === "PAST_DUE" ? new Date(s.endsAt.getTime() + graceDays * DAY) : s.endsAt;
    if (until.getTime() <= now) continue;
    if (!best || rank(s.planCode) > rank(best.code) || (rank(s.planCode) === rank(best.code) && until > best.endsAt)) best = { code: s.planCode, endsAt: until };
  }
  await db.update(schema.users).set({ planCode: best?.code ?? "FREE", planEndsAt: best?.endsAt ?? null }).where(eq(schema.users.id, userId));
  return best;
}

/**
 * Finds our payment for a gateway event. The gateway's own references (order id, subscription id) win;
 * our id from the notes is only trusted when it agrees with them, because notes can be set by the browser.
 */
async function findPayment(ev: { ourPaymentId?: string | null; orderId?: string | null; subRef?: string | null; internal?: boolean }) {
  if (ev.orderId) {
    const byOrder = await db.query.payments.findFirst({ where: eq(schema.payments.providerOrderId, ev.orderId) });
    if (byOrder) return byOrder;
  }
  if (ev.ourPaymentId) {
    const p = await db.query.payments.findFirst({ where: eq(schema.payments.id, ev.ourPaymentId) });
    if (!p) return null;
    if (ev.internal && p.provider === "MOCK") return p; // test provider: the event came from our own server
    // Real gateway: our id must agree with the gateway's own reference for that payment.
    if (ev.orderId) return p.providerOrderId === ev.orderId ? p : null;
    if (ev.subRef && p.subscriptionId) {
      const sub = await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.id, p.subscriptionId) });
      return sub?.providerRef === ev.subRef ? p : null;
    }
    return null;
  }
  return null;
}

const SETTLEABLE = ["CREATED", "FAILED"]; // a failed attempt can still succeed on retry (same order / mandate)

async function subByRef(ref: string | null | undefined) {
  return ref ? (await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.providerRef, ref) })) ?? null : null;
}

export async function applyEvent(ev: BillingEvent): Promise<string> {
  switch (ev.t) {
    case "CAPTURED": {
      if (await db.query.payments.findFirst({ where: eq(schema.payments.providerPaymentId, ev.providerPaymentId) })) return "duplicate";
      let payment = await findPayment(ev);
      const sub = payment?.subscriptionId ? (await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.id, payment.subscriptionId) })) ?? null : await subByRef(ev.subRef);
      if ((!payment || !SETTLEABLE.includes(payment.status)) && sub) {
        // The first payment on a mandate settles the checkout's payment; later ones are renewals.
        payment = (await db.query.payments.findFirst({ where: and(eq(schema.payments.subscriptionId, sub.id), inArray(schema.payments.status, SETTLEABLE), ne(schema.payments.purpose, "RENEWAL")) })) ?? null;
      }
      if (payment && SETTLEABLE.includes(payment.status) && payment.purpose !== "RENEWAL") return activate(payment, sub, ev);
      if (sub && sub.kind === "RECURRING" && sub.providerRef === ev.subRef) return renew(sub, ev);
      if (payment) return "already_processed";
      await audit(null, "billing.unmatched_capture", "payment", null, { providerPaymentId: ev.providerPaymentId, amount: ev.amountMinor });
      return "unmatched";
    }
    case "FAILED": {
      const payment = (await findPayment(ev)) ?? (ev.subRef ? await db.query.payments.findFirst({ where: and(eq(schema.payments.status, "CREATED"), eq(schema.payments.subscriptionId, (await subByRef(ev.subRef))?.id ?? "")) }) : null);
      if (!payment || payment.status !== "CREATED") return "ignored";
      const reason = friendlyFailure(ev.code, ev.description);
      await db.update(schema.payments).set({ status: "FAILED", failureCode: ev.code.slice(0, 60), failureReason: reason, providerPaymentId: ev.providerPaymentId ?? null }).where(eq(schema.payments.id, payment.id));
      const recent = await db.select({ id: schema.payments.id }).from(schema.payments).where(and(eq(schema.payments.userId, payment.userId), eq(schema.payments.status, "FAILED"), sql`${schema.payments.createdAt} > ${Date.now() - DAY}`));
      if (recent.length >= 5) await addRiskSignal(payment.userId, "PAYMENT_FAILURES", 15, `${recent.length} failed payments in 24h`);
      await audit(null, "billing.payment_failed", "payment", payment.id, { code: ev.code });
      return "failed";
    }
    case "SUB_PAST_DUE":
    case "SUB_HALTED": {
      const sub = await subByRef(ev.subRef);
      if (!sub || !["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status)) return "ignored";
      await db.update(schema.subscriptions).set({ status: "PAST_DUE" }).where(eq(schema.subscriptions.id, sub.id));
      const grace = await getConfig("billing.graceDays");
      await notify(sub.userId, "SUBSCRIPTION", "We couldn't process your renewal",
        `Your ${planName(sub.planCode)} stays on for ${grace} more days while we retry. You can update your payment method in My Subscription.`, "/subscription");
      await syncUserPlan(sub.userId);
      return "past_due";
    }
    case "SUB_CANCELLED": {
      const sub = await subByRef(ev.subRef);
      if (!sub || sub.status === "EXPIRED") return "ignored";
      await db.update(schema.subscriptions).set({ status: "CANCELLED", cancelAtPeriodEnd: true, nextChargeAt: null, nextChargeMinor: null }).where(eq(schema.subscriptions.id, sub.id));
      await syncUserPlan(sub.userId);
      return "cancelled";
    }
    case "REFUND_PROCESSED": {
      const r = (await db.query.refunds.findFirst({ where: eq(schema.refunds.providerRefundId, ev.providerRefundId) }))
        ?? (ev.ourRefundId ? await db.query.refunds.findFirst({ where: eq(schema.refunds.id, ev.ourRefundId) }) : undefined);
      if (!r || r.status === "PROCESSED") return "ignored";
      await finishRefund(r.id);
      return "refunded";
    }
    case "REFUND_FAILED": {
      await db.update(schema.refunds).set({ status: "FAILED" }).where(eq(schema.refunds.providerRefundId, ev.providerRefundId));
      return "refund_failed";
    }
    case "DISPUTE": {
      const p = await db.query.payments.findFirst({ where: eq(schema.payments.providerPaymentId, ev.providerPaymentId) });
      if (!p || p.disputed) return "ignored";
      await db.update(schema.payments).set({ disputed: true }).where(eq(schema.payments.id, p.id));
      await addRiskSignal(p.userId, "CHARGEBACK", 40, `Dispute on ${p.id}`);
      await audit(null, "billing.dispute", "payment", p.id, { amount: ev.amountMinor });
      return "disputed";
    }
  }
}

async function activate(payment: typeof schema.payments.$inferSelect, sub: typeof schema.subscriptions.$inferSelect | null, ev: Extract<BillingEvent, { t: "CAPTURED" }>) {
  if (ev.amountMinor < payment.amountMinor || ev.currency !== payment.currency) {
    // Never grant access for less than the quoted amount.
    await db.update(schema.payments).set({ status: "FAILED", failureCode: "AMOUNT_MISMATCH", failureReason: "We couldn't confirm this payment. Our team has been alerted.", providerPaymentId: ev.providerPaymentId }).where(eq(schema.payments.id, payment.id));
    await audit(null, "billing.amount_mismatch", "payment", payment.id, { expected: payment.amountMinor, got: ev.amountMinor, currency: ev.currency });
    return "amount_mismatch";
  }
  const now = new Date();
  // Claim the payment atomically: only one event (of several that can arrive together) proceeds.
  const claimed = await db.update(schema.payments).set({ status: "CAPTURED", providerPaymentId: ev.providerPaymentId, method: ev.method, paidAt: now, failureCode: null, failureReason: null })
    .where(and(eq(schema.payments.id, payment.id), inArray(schema.payments.status, SETTLEABLE))).returning({ id: schema.payments.id });
  if (!claimed.length) return "duplicate";
  try {
    return await activateClaimed(payment, sub, ev, now);
  } catch (e) {
    // Undo the claim so the gateway's retry of this webhook can finish the job.
    await db.update(schema.payments).set({ status: payment.status, providerPaymentId: null, paidAt: null, invoiceNo: null }).where(eq(schema.payments.id, payment.id));
    throw e;
  }
}

async function activateClaimed(payment: typeof schema.payments.$inferSelect, sub: typeof schema.subscriptions.$inferSelect | null, ev: Extract<BillingEvent, { t: "CAPTURED" }>, now: Date) {
  const invoiceNo = await nextInvoiceNo(now);
  await db.update(schema.payments).set({ invoiceNo }).where(eq(schema.payments.id, payment.id));
  if (sub && sub.status !== "PENDING") {
    // A checkout that was replaced or abandoned got paid anyway: keep the money on record, refund it, never double-activate.
    if (sub.providerRef && sub.kind === "RECURRING") await providerByName(sub.provider)?.cancelAtCycleEnd(sub.providerRef).catch(() => {});
    await db.insert(schema.refunds).values({ paymentId: payment.id, amountMinor: ev.amountMinor, reason: "Automatic: payment for a checkout that had been replaced or cancelled", requestedById: "system" });
    await audit(null, "billing.orphan_capture", "payment", payment.id, { subStatus: sub.status });
    await notify(payment.userId, "SUBSCRIPTION", "We received an extra payment", `${formatMoney(ev.amountMinor, ev.currency)} came in for a checkout you didn't finish. We'll refund it — no action needed.`, "/subscription");
    return "orphan_refund_requested";
  }
  if (sub) {
    const days = sub.kind === "PASS" ? sub.periodDays : sub.introEndsAt ? Math.round((sub.introEndsAt.getTime() - sub.startedAt.getTime()) / DAY) : sub.periodDays;
    const endsAt = new Date(now.getTime() + days * DAY);
    await db.update(schema.subscriptions).set({
      status: sub.kind === "PASS" ? "CANCELLED" : sub.introEndsAt ? "TRIALING" : "ACTIVE",
      startedAt: now, endsAt, introEndsAt: sub.introEndsAt ? endsAt : null,
      nextChargeAt: sub.kind === "PASS" ? null : endsAt, cancelAtPeriodEnd: sub.kind === "PASS",
    }).where(eq(schema.subscriptions.id, sub.id));
    // A new paid plan replaces any older one still running (e.g. a pass).
    await db.update(schema.subscriptions).set({ status: "EXPIRED", endsAt: now })
      .where(and(eq(schema.subscriptions.userId, sub.userId), ne(schema.subscriptions.id, sub.id), inArray(schema.subscriptions.status, ["TRIALING", "ACTIVE", "PAST_DUE"]), ne(schema.subscriptions.provider, "REWARD")));
  }
  if (payment.couponCode) {
    const c = await couponByCode(payment.couponCode);
    if (c) {
      await db.insert(schema.couponRedemptions).values({ couponId: c.id, userId: payment.userId, paymentId: payment.id, discountMinor: payment.discountMinor }).onConflictDoNothing();
      const inc = await db.update(schema.coupons).set({ usedCount: sql`${schema.coupons.usedCount} + 1` })
        .where(and(eq(schema.coupons.id, c.id), sql`(${schema.coupons.usageLimit} is null or ${schema.coupons.usedCount} < ${schema.coupons.usageLimit})`)).returning({ id: schema.coupons.id });
      if (!inc.length) await audit(null, "billing.coupon_over_limit", "coupon", c.id, { paymentId: payment.id }); // honoured: the person already paid the quoted price
    }
  }
  await syncUserPlan(payment.userId);
  const s = sub ? await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.id, sub.id) }) : null;
  await notify(payment.userId, "SUBSCRIPTION", "Payment successful 🎉",
    s?.nextChargeAt
      ? `${planName(payment.planCode)} is on. Next payment: ${formatMoney(s.nextChargeMinor ?? s.amountMinor, s.currency)} on ${formatDate(s.nextChargeAt)}. Invoice ${invoiceNo}.`
      : `${planName(payment.planCode)} is on until ${formatDate(s?.endsAt ?? now)}. Invoice ${invoiceNo}.`, "/subscription");
  await audit(null, "billing.captured", "payment", payment.id, { amount: ev.amountMinor, invoiceNo });
  return "activated";
}

async function renew(sub: typeof schema.subscriptions.$inferSelect, ev: Extract<BillingEvent, { t: "CAPTURED" }>) {
  const now = new Date();
  const owner = await db.query.users.findFirst({ where: eq(schema.users.id, sub.userId) });
  if (!["TRIALING", "ACTIVE", "PAST_DUE"].includes(sub.status) || sub.cancelAtPeriodEnd || !owner || owner.status === "DELETED") {
    // Money arrived on a mandate that should have stopped: record it and queue a refund for staff.
    const [p] = await db.insert(schema.payments).values({ userId: sub.userId, subscriptionId: sub.id, provider: sub.provider, purpose: "RENEWAL", status: "CAPTURED", amountMinor: ev.amountMinor, currency: ev.currency, planCode: sub.planCode, providerPaymentId: ev.providerPaymentId, method: ev.method, paidAt: now, invoiceNo: await nextInvoiceNo(now) }).returning();
    await db.insert(schema.refunds).values({ paymentId: p.id, amountMinor: ev.amountMinor, reason: "Automatic: charged after the plan was cancelled, expired or the account deleted", requestedById: "system" });
    if (sub.providerRef) await providerByName(sub.provider)?.cancelAtCycleEnd(sub.providerRef).catch(() => {});
    await audit(null, "billing.charge_after_stop", "subscription", sub.id, { amount: ev.amountMinor, status: sub.status });
    return "refund_requested";
  }
  const planCode = sub.pendingPlanCode ?? sub.planCode;
  let amount = sub.amountMinor;
  if (sub.pendingPlanCode && sub.priceId) {
    const newPrice = await pendingPrice(sub);
    if (newPrice) amount = newPrice.amountMinor;
  }
  if (ev.amountMinor !== amount && ev.amountMinor !== sub.amountMinor)
    await audit(null, "billing.renewal_amount_mismatch", "subscription", sub.id, { expected: amount, got: ev.amountMinor });
  const base = Math.max(sub.endsAt.getTime(), now.getTime());
  const endsAt = new Date(base + sub.periodDays * DAY);
  const invoiceNo = await nextInvoiceNo(now);
  await db.insert(schema.payments).values({
    userId: sub.userId, subscriptionId: sub.id, provider: sub.provider, purpose: "RENEWAL", status: "CAPTURED",
    amountMinor: ev.amountMinor, currency: ev.currency, planCode, providerPaymentId: ev.providerPaymentId, method: ev.method, paidAt: now, invoiceNo,
  });
  await db.update(schema.subscriptions).set({
    status: "ACTIVE", planCode, pendingPlanCode: null, amountMinor: amount, endsAt, nextChargeAt: endsAt, nextChargeMinor: amount, introEndsAt: null,
  }).where(eq(schema.subscriptions.id, sub.id));
  await syncUserPlan(sub.userId);
  await notify(sub.userId, "SUBSCRIPTION", "Payment received", `${formatMoney(ev.amountMinor, ev.currency)} for ${planName(planCode)}. Next payment on ${formatDate(endsAt)}. Invoice ${invoiceNo}.`, "/subscription");
  await audit(null, "billing.renewed", "subscription", sub.id, { amount: ev.amountMinor, invoiceNo });
  return "renewed";
}

async function pendingPrice(sub: typeof schema.subscriptions.$inferSelect) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, sub.userId) });
  if (!user || !sub.pendingPlanCode) return null;
  const [buyer, prices, gc] = await Promise.all([loadBuyer(user), priceRows(), getConfig("billing.genderPricingCountries")]);
  return pickPrice(prices, sub.pendingPlanCode, buyer, gc);
}

// ---------------------------------------------------------------------------
// Managing a subscription
// ---------------------------------------------------------------------------

export async function liveSubscription(userId: string) {
  const subs = await db.select().from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, userId), inArray(schema.subscriptions.status, [...LIVE]), ne(schema.subscriptions.provider, "REWARD")))
    .orderBy(desc(schema.subscriptions.endsAt));
  return subs.find((s) => s.endsAt.getTime() > Date.now() || s.status === "PAST_DUE") ?? null;
}

export async function subscriptionSummary(userId: string) {
  const s = await liveSubscription(userId);
  const reward = await db.query.subscriptions.findFirst({ where: and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.provider, "REWARD"), inArray(schema.subscriptions.status, ["ACTIVE", "CANCELLED"])), orderBy: desc(schema.subscriptions.endsAt) });
  const banked = await db.select({ days: schema.subscriptions.periodDays }).from(schema.subscriptions).where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.status, "BANKED")));
  if (!s) {
    return reward && reward.endsAt.getTime() > Date.now()
      ? { status: "REWARD", planCode: reward.planCode, planName: planName(reward.planCode), endsAt: reward.endsAt, renews: false, bankedDays: banked.reduce((a, b) => a + b.days, 0) }
      : { status: "NONE", bankedDays: banked.reduce((a, b) => a + b.days, 0) };
  }
  return {
    id: s.id, status: s.status, kind: s.kind, provider: s.provider, planCode: s.planCode, planName: planName(s.planCode),
    endsAt: s.endsAt, renews: s.kind === "RECURRING" && !s.cancelAtPeriodEnd && s.status !== "CANCELLED",
    inIntro: s.status === "TRIALING", nextChargeAt: s.nextChargeAt, nextChargeMinor: s.nextChargeMinor, currency: s.currency,
    regularMinor: s.amountMinor, periodDays: s.periodDays, pendingPlanCode: s.pendingPlanCode, pendingPlanName: s.pendingPlanCode ? planName(s.pendingPlanCode) : null,
    bankedDays: banked.reduce((a, b) => a + b.days, 0),
  };
}

export async function cancelSubscription(user: User) {
  const s = await liveSubscription(user.id);
  if (!s || s.kind !== "RECURRING" || s.cancelAtPeriodEnd) throw new ApiError(404, "You don't have a plan that renews.", "none");
  if (s.providerRef) await providerByName(s.provider)?.cancelAtCycleEnd(s.providerRef);
  await db.update(schema.subscriptions).set({ status: "CANCELLED", cancelAtPeriodEnd: true, nextChargeAt: null, nextChargeMinor: null }).where(eq(schema.subscriptions.id, s.id));
  await audit(user.id, "subscription.cancel", "subscription", s.id);
  await notify(user.id, "SUBSCRIPTION", "Auto-renew is off", `You won't be charged again. ${planName(s.planCode)} stays on until ${formatDate(s.endsAt)}.`, "/subscription");
  return { cancelled: true, accessUntil: s.endsAt };
}

export async function resumeSubscription(user: User) {
  const s = await liveSubscription(user.id);
  if (!s || s.kind !== "RECURRING" || !s.cancelAtPeriodEnd || s.endsAt.getTime() <= Date.now()) throw new ApiError(404, "There's nothing to resume.", "none");
  if (s.provider === "RAZORPAY") throw new ApiError(409, "Once cancelled with your bank, auto-pay can't be restarted. You can subscribe again when this period ends.", "cannot_resume");
  await db.update(schema.subscriptions).set({ status: s.introEndsAt ? "TRIALING" : "ACTIVE", cancelAtPeriodEnd: false, nextChargeAt: s.endsAt, nextChargeMinor: s.amountMinor }).where(eq(schema.subscriptions.id, s.id));
  await audit(user.id, "subscription.resume", "subscription", s.id);
  return subscriptionSummary(user.id);
}

export async function changePlan(user: User, planCode: string) {
  const s = await liveSubscription(user.id);
  if (!s || s.kind !== "RECURRING" || s.cancelAtPeriodEnd) throw new ApiError(404, "You need a plan that renews to change it.", "none");
  if (planCode === s.planCode) {
    await db.update(schema.subscriptions).set({ pendingPlanCode: null }).where(eq(schema.subscriptions.id, s.id));
    return subscriptionSummary(user.id);
  }
  const [buyer, prices, gc] = await Promise.all([loadBuyer(user), priceRows(), getConfig("billing.genderPricingCountries")]);
  const price = pickPrice(prices, planCode, buyer, gc);
  if (!price) throw new ApiError(404, "That plan isn't available.", "not_found");
  if (s.providerRef && s.provider === "RAZORPAY") {
    if (!price.providerPlanId) throw new ApiError(409, "That plan can't be switched to yet. Please contact support.", "plan_not_synced");
    await razorpayProvider.changePlanAtCycleEnd(s.providerRef, price.providerPlanId);
  }
  await db.update(schema.subscriptions).set({ pendingPlanCode: planCode, nextChargeMinor: price.amountMinor }).where(eq(schema.subscriptions.id, s.id));
  await audit(user.id, "subscription.change_plan", "subscription", s.id, { to: planCode });
  return subscriptionSummary(user.id);
}

export async function paymentHistory(userId: string) {
  const rows = await db.select().from(schema.payments).where(and(eq(schema.payments.userId, userId), ne(schema.payments.status, "CREATED"))).orderBy(desc(schema.payments.createdAt)).limit(50);
  return rows.map((p) => ({
    id: p.id, status: p.status, purpose: p.purpose, planName: planName(p.planCode), amountMinor: p.amountMinor, currency: p.currency,
    discountMinor: p.discountMinor, couponCode: p.couponCode, method: p.method, failureReason: p.failureReason, refundedMinor: p.refundedMinor,
    invoiceNo: p.invoiceNo, createdAt: p.createdAt, paidAt: p.paidAt,
  }));
}

// ---------------------------------------------------------------------------
// Refunds (two-person rule)
// ---------------------------------------------------------------------------

export async function requestRefund(staff: User, input: { paymentId: string; amountMinor: number; reason: string; revokeAccess: boolean }) {
  const p = await db.query.payments.findFirst({ where: eq(schema.payments.id, input.paymentId) });
  if (!p || !["CAPTURED", "PARTIALLY_REFUNDED"].includes(p.status)) throw new ApiError(404, "Only completed payments can be refunded.", "not_refundable");
  const open = await db.query.refunds.findFirst({ where: and(eq(schema.refunds.paymentId, p.id), inArray(schema.refunds.status, ["REQUESTED", "APPROVED"])) });
  if (open) throw new ApiError(409, "There's already an open refund for this payment.", "refund_open");
  if (input.amountMinor <= 0 || input.amountMinor > p.amountMinor - p.refundedMinor) throw new ApiError(422, "Refund amount is more than what's left on this payment.", "amount");
  const [r] = await db.insert(schema.refunds).values({ paymentId: p.id, amountMinor: input.amountMinor, reason: input.reason, revokeAccess: input.revokeAccess, requestedById: staff.id }).returning();
  await audit(staff.id, "refund.request", "refund", r.id, { paymentId: p.id, amount: input.amountMinor, reason: input.reason });
  return r;
}

export async function decideRefund(staff: User, refundId: string, approve: boolean, note: string) {
  const r = await db.query.refunds.findFirst({ where: eq(schema.refunds.id, refundId) });
  if (!r || r.status !== "REQUESTED") throw new ApiError(404, "This refund isn't waiting for a decision.", "not_pending");
  if (r.requestedById === staff.id) throw new ApiError(403, "Someone else has to approve a refund you requested.", "four_eyes");
  const now = new Date();
  if (!approve) {
    await db.update(schema.refunds).set({ status: "REJECTED", decidedById: staff.id, decidedAt: now, decisionNote: note }).where(eq(schema.refunds.id, r.id));
    await audit(staff.id, "refund.reject", "refund", r.id, { note });
    return { status: "REJECTED" };
  }
  const p = (await db.query.payments.findFirst({ where: eq(schema.payments.id, r.paymentId) }))!;
  const provider = providerByName(p.provider);
  if (!provider || !p.providerPaymentId) throw new ApiError(409, "This payment can't be refunded automatically.", "manual_refund");
  // Claim first so two approvers clicking together can't both send money back.
  const claimed = await db.update(schema.refunds).set({ status: "APPROVED", decidedById: staff.id, decidedAt: now, decisionNote: note })
    .where(and(eq(schema.refunds.id, r.id), eq(schema.refunds.status, "REQUESTED"))).returning({ id: schema.refunds.id });
  if (!claimed.length) throw new ApiError(409, "Someone else has already decided this refund.", "already_decided");
  let res: { providerRefundId: string; status: "PROCESSED" | "PENDING" };
  try {
    res = await provider.refund(p.providerPaymentId, r.amountMinor, r.reason, r.id);
  } catch (e) {
    await db.update(schema.refunds).set({ status: "REQUESTED", decidedById: null, decidedAt: null, decisionNote: null }).where(eq(schema.refunds.id, r.id));
    throw new ApiError(502, "The payment gateway didn't accept the refund. Nothing was sent — try again shortly.", "gateway_error");
  }
  await db.update(schema.refunds).set({ providerRefundId: res.providerRefundId }).where(eq(schema.refunds.id, r.id));
  await audit(staff.id, "refund.approve", "refund", r.id, { providerRefundId: res.providerRefundId });
  if (res.status === "PROCESSED") await finishRefund(r.id);
  return { status: res.status === "PROCESSED" ? "PROCESSED" : "APPROVED" };
}

async function finishRefund(refundId: string) {
  const r = (await db.query.refunds.findFirst({ where: eq(schema.refunds.id, refundId) }))!;
  const p = (await db.query.payments.findFirst({ where: eq(schema.payments.id, r.paymentId) }))!;
  const refunded = p.refundedMinor + r.amountMinor;
  await db.update(schema.refunds).set({ status: "PROCESSED", processedAt: new Date() }).where(eq(schema.refunds.id, r.id));
  await db.update(schema.payments).set({ refundedMinor: refunded, status: refunded >= p.amountMinor ? "REFUNDED" : "PARTIALLY_REFUNDED" }).where(eq(schema.payments.id, p.id));
  if (r.revokeAccess && p.subscriptionId) {
    const sub = await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.id, p.subscriptionId) });
    if (sub?.providerRef && sub.kind === "RECURRING" && !sub.cancelAtPeriodEnd) await providerByName(sub.provider)?.cancelAtCycleEnd(sub.providerRef).catch(() => {});
    await db.update(schema.subscriptions).set({ status: "EXPIRED", endsAt: new Date(), cancelAtPeriodEnd: true, nextChargeAt: null }).where(eq(schema.subscriptions.id, p.subscriptionId));
    await syncUserPlan(p.userId);
  }
  await notify(p.userId, "SUBSCRIPTION", "Refund processed", `${formatMoney(r.amountMinor, p.currency)} is on its way back to your original payment method. Banks usually take 5–7 working days.`, "/subscription");
  await audit(null, "refund.processed", "refund", r.id, {});
}

// ---------------------------------------------------------------------------
// Rewards (referrals, verification) — free Premium days, never cash
// ---------------------------------------------------------------------------

export async function grantPremiumDays(userId: string, days: number, reason: string) {
  if (days <= 0) return null;
  const live = await liveSubscription(userId);
  // Someone already paying keeps the days "banked" and they start when their paid plan ends.
  if (live && live.kind === "RECURRING" && !live.cancelAtPeriodEnd) {
    await db.insert(schema.subscriptions).values({ userId, planCode: "PREMIUM", provider: "REWARD", status: "BANKED", kind: "PASS", periodDays: days, endsAt: new Date(), couponCode: reason.slice(0, 40) });
    await notify(userId, "SUBSCRIPTION", `${days} Premium days saved for you`, "They'll start automatically when your current plan ends.", "/subscription");
    return "banked";
  }
  const start = Math.max(Date.now(), live?.endsAt.getTime() ?? 0, (await currentRewardEnd(userId)) ?? 0);
  const endsAt = new Date(start + days * DAY);
  await db.insert(schema.subscriptions).values({ userId, planCode: "PREMIUM", provider: "REWARD", status: "ACTIVE", kind: "PASS", periodDays: days, cancelAtPeriodEnd: true, endsAt, couponCode: reason.slice(0, 40) });
  await syncUserPlan(userId);
  await notify(userId, "SUBSCRIPTION", `You earned ${days} Premium days 🎉`, `Enjoy Premium until ${formatDate(endsAt)}. No payment needed and nothing renews.`, "/subscription");
  return "granted";
}

async function currentRewardEnd(userId: string) {
  const r = await db.query.subscriptions.findFirst({ where: and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.provider, "REWARD"), eq(schema.subscriptions.status, "ACTIVE")), orderBy: desc(schema.subscriptions.endsAt) });
  return r?.endsAt.getTime() ?? null;
}

// ---------------------------------------------------------------------------
// Scheduled jobs: reminders, test-mode renewals, expiry, banked rewards
// ---------------------------------------------------------------------------

export async function runBillingJobs(now = new Date()) {
  const out = { reminders: 0, mockRenewals: 0, expired: 0, bankedStarted: 0 };
  const reminderDays = await getConfig("billing.reminderDays");
  const graceDays = await getConfig("billing.graceDays");

  // 1) Renewal reminders (in addition to the bank's own pre-debit notice for UPI Autopay / e-mandates).
  const soon = new Date(now.getTime() + reminderDays * DAY);
  const due = await db.select().from(schema.subscriptions).where(and(inArray(schema.subscriptions.status, ["TRIALING", "ACTIVE"]), eq(schema.subscriptions.cancelAtPeriodEnd, false), isNotNull(schema.subscriptions.nextChargeAt), lte(schema.subscriptions.nextChargeAt, soon)));
  for (const s of due) {
    if (!s.nextChargeAt || s.nextChargeAt <= now || s.reminderSentFor?.getTime() === s.nextChargeAt.getTime()) continue;
    await notify(s.userId, "SUBSCRIPTION", s.status === "TRIALING" ? "Your intro period ends soon" : "Upcoming payment",
      `${formatMoney(s.nextChargeMinor ?? s.amountMinor, s.currency)} for ${planName(s.pendingPlanCode ?? s.planCode)} on ${formatDate(s.nextChargeAt)}. Don't want it? Turn off auto-renew in My Subscription before then.`, "/subscription");
    await db.update(schema.subscriptions).set({ reminderSentFor: s.nextChargeAt }).where(eq(schema.subscriptions.id, s.id));
    out.reminders++;
  }

  // 2) Test-mode renewals. Real gateways renew on their own and tell us through webhooks.
  if (mockAllowed()) {
    const mockDue = await db.select().from(schema.subscriptions).where(and(eq(schema.subscriptions.provider, "MOCK"), inArray(schema.subscriptions.status, ["TRIALING", "ACTIVE"]), eq(schema.subscriptions.cancelAtPeriodEnd, false), lte(schema.subscriptions.nextChargeAt, now)));
    for (const s of mockDue) {
      const price = s.pendingPlanCode ? await pendingPrice(s) : null;
      await applyEvent({ t: "CAPTURED", providerPaymentId: `mock_pay_${s.id.slice(0, 8)}_${now.getTime()}`, amountMinor: price?.amountMinor ?? s.amountMinor, currency: s.currency, method: "upi", subRef: s.providerRef, internal: true });
      out.mockRenewals++;
    }
  }

  // 3) Expire what has run out (past-due gets the grace period).
  const live = await db.select().from(schema.subscriptions).where(inArray(schema.subscriptions.status, [...LIVE]));
  for (const s of live) {
    // Renewing plans (and past-due ones) get the grace period for the gateway's charge to arrive.
    const renewing = (["ACTIVE", "TRIALING", "PAST_DUE"].includes(s.status)) && !s.cancelAtPeriodEnd && s.kind === "RECURRING";
    const until = renewing ? s.endsAt.getTime() + graceDays * DAY : s.endsAt.getTime();
    if (until <= now.getTime()) {
      await db.update(schema.subscriptions).set({ status: "EXPIRED" }).where(eq(schema.subscriptions.id, s.id));
      await syncUserPlan(s.userId);
      out.expired++;
    }
  }

  // 4) Start banked reward days for anyone whose paid plan has ended.
  const banked = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.status, "BANKED"));
  for (const b of banked) {
    const live = await liveSubscription(b.userId);
    if (live && live.kind === "RECURRING" && !live.cancelAtPeriodEnd) continue;
    const start = Math.max(now.getTime(), live?.endsAt.getTime() ?? 0);
    await db.update(schema.subscriptions).set({ status: "ACTIVE", startedAt: new Date(start), endsAt: new Date(start + b.periodDays * DAY), cancelAtPeriodEnd: true }).where(eq(schema.subscriptions.id, b.id));
    await syncUserPlan(b.userId);
    out.bankedStarted++;
  }
  return out;
}
