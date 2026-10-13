// Razorpay (India): UPI / UPI Autopay, cards, net banking and wallets through Razorpay Checkout.
// We never see card numbers, CVV, UPI PIN or bank passwords — Razorpay collects them on its own page.
//
// Recurring plans use Razorpay Subscriptions: the intro price (e.g. ₹1) or a discounted first period
// is an upfront add-on charged when the person approves the mandate, and the regular price starts at
// `start_at`. One-off passes use Orders. Activation happens only from signature-verified webhooks.
//
// STATUS: written against Razorpay's documented API; not yet run against a live Razorpay account.
// Test it in Razorpay test mode before launch (see docs/PAYMENTS.md).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingEvent, PaymentProvider } from "./types";

const API = "https://api.razorpay.com/v1";

function creds() {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Razorpay keys are not configured");
  return { id, secret };
}

async function rp<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { id, secret } = creds();
  const res = await fetch(API + path, {
    method,
    headers: { authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(`Razorpay ${path} failed: ${json?.error?.code ?? res.status}`);
  return json as T;
}

export function hmacHex(secret: string, data: string) {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Webhook signature: HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
  if (!secret || !signature) return false;
  return safeEqualHex(hmacHex(secret, rawBody), signature);
}

// Razorpay plans: monthly/yearly/weekly, or daily with an interval of at least 7.
const period = (d: number) => {
  if (d % 365 === 0) return { period: "yearly", interval: d / 365 };
  if (d % 30 === 0) return { period: "monthly", interval: d / 30 };
  if (d % 7 === 0) return { period: "weekly", interval: d / 7 };
  if (d >= 7) return { period: "daily", interval: d };
  throw new Error("Recurring plans must be at least 7 days long");
};

export const razorpayProvider: PaymentProvider = {
  name: "RAZORPAY",
  async createCheckout(req) {
    // Subscription notes are copied onto every renewal, so they carry only the subscription id;
    // the one-off order (passes) can carry the payment id because it is paid once.
    const notes = req.kind === "PASS" ? { pc_payment_id: req.ourPaymentId, pc_subscription_id: req.ourSubscriptionId } : { pc_subscription_id: req.ourSubscriptionId };
    if (req.kind === "PASS") {
      const order = await rp<{ id: string }>("POST", "/orders", { amount: req.todayMinor, currency: req.currency, receipt: req.ourPaymentId.slice(0, 40), notes });
      return { provider: "RAZORPAY", providerRef: order.id, providerOrderId: order.id, client: { keyId: creds().id, orderId: order.id, amount: req.todayMinor, currency: req.currency, name: req.planName, prefill: { name: req.customer.name, email: req.customer.email, contact: req.customer.phone ?? undefined }, notes } };
    }
    let planId = req.providerPlanId;
    let createdPlan: string | undefined;
    if (!planId) {
      const plan = await rp<{ id: string }>("POST", "/plans", { ...period(req.periodDays), item: { name: req.planName, amount: req.regularMinor, currency: req.currency } });
      planId = createdPlan = plan.id;
    }
    const sub = await rp<{ id: string }>("POST", "/subscriptions", {
      plan_id: planId,
      total_count: 120, // the mandate's maximum cycles; the person can cancel any time
      customer_notify: 1,
      start_at: req.firstChargeAt ? Math.floor(req.firstChargeAt.getTime() / 1000) : undefined,
      addons: [{ item: { name: "First payment", amount: req.todayMinor, currency: req.currency } }],
      notes,
    });
    return { provider: "RAZORPAY", providerRef: sub.id, providerPlanId: createdPlan, client: { keyId: creds().id, subscriptionId: sub.id, name: req.planName, prefill: { name: req.customer.name, email: req.customer.email, contact: req.customer.phone ?? undefined }, notes } };
  },
  verifyClientResult({ providerRef, kind, paymentId, signature }) {
    const { secret } = creds();
    const data = kind === "PASS" ? `${providerRef}|${paymentId}` : `${paymentId}|${providerRef}`;
    return safeEqualHex(hmacHex(secret, data), signature);
  },
  async cancelAtCycleEnd(ref) { await rp("POST", `/subscriptions/${ref}/cancel`, { cancel_at_cycle_end: 1 }); },
  async resume(ref) { await rp("POST", `/subscriptions/${ref}/cancel_scheduled_changes`); },
  async changePlanAtCycleEnd(ref, planId) { await rp("PATCH", `/subscriptions/${ref}`, { plan_id: planId, schedule_change_at: "cycle_end" }); },
  async refund(paymentId, amount, note, ourRefundId) {
    const r = await rp<{ id: string; status: string }>("POST", `/payments/${paymentId}/refund`, { amount, notes: { reason: note.slice(0, 250), pc_refund_id: ourRefundId } });
    return { providerRefundId: r.id, status: r.status === "processed" ? "PROCESSED" : "PENDING" };
  },
};

/** Maps a Razorpay webhook body to our normalised events. Unknown events map to []. */
export function parseRazorpayEvent(body: any): BillingEvent[] {
  const ev: string = body?.event ?? "";
  const pay = body?.payload?.payment?.entity;
  const sub = body?.payload?.subscription?.entity;
  const refund = body?.payload?.refund?.entity;
  const dispute = body?.payload?.dispute?.entity;
  const ourPaymentId = pay?.notes?.pc_payment_id ?? sub?.notes?.pc_payment_id ?? null;
  const out: BillingEvent[] = [];
  switch (ev) {
    case "payment.captured":
    case "order.paid":
    case "subscription.authenticated":
    case "subscription.charged":
      if (pay && pay.status === "captured")
        out.push({ t: "CAPTURED", providerPaymentId: pay.id, amountMinor: pay.amount, currency: pay.currency, method: pay.method ?? null, orderId: pay.order_id ?? null, subRef: sub?.id ?? null, ourPaymentId });
      break;
    case "payment.failed":
      if (pay) out.push({ t: "FAILED", providerPaymentId: pay.id, orderId: pay.order_id ?? null, subRef: sub?.id ?? null, ourPaymentId, code: pay.error_reason ?? pay.error_code ?? "FAILED", description: pay.error_description ?? null });
      break;
    case "subscription.pending":
      if (sub) out.push({ t: "SUB_PAST_DUE", subRef: sub.id });
      break;
    case "subscription.halted":
      if (sub) out.push({ t: "SUB_HALTED", subRef: sub.id });
      break;
    case "subscription.cancelled":
    case "subscription.completed":
      if (sub) out.push({ t: "SUB_CANCELLED", subRef: sub.id });
      break;
    case "refund.processed":
      if (refund) out.push({ t: "REFUND_PROCESSED", providerRefundId: refund.id, providerPaymentId: refund.payment_id, amountMinor: refund.amount, ourRefundId: refund.notes?.pc_refund_id ?? null });
      break;
    case "refund.failed":
      if (refund) out.push({ t: "REFUND_FAILED", providerRefundId: refund.id });
      break;
    case "payment.dispute.created":
      if (dispute) out.push({ t: "DISPUTE", providerPaymentId: dispute.payment_id, amountMinor: dispute.amount });
      break;
  }
  return out;
}
