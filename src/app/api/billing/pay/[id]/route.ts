import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, publicRoute } from "@/lib/http";
import { verifyScoped } from "@/lib/paytoken";
import { formatDate, formatMoney, planName } from "@/lib/pricing";

/** Everything the hosted pay page shows and needs to open checkout. Scoped token only; no secrets. */
export const GET = publicRoute<{ id: string }>(async ({ req, params }) => {
  const userId = await verifyScoped(new URL(req.url).searchParams.get("t"), "pay", params.id);
  if (!userId) throw new ApiError(401, "This payment link has expired. Please start again from the app.", "token");
  const p = await db.query.payments.findFirst({ where: eq(schema.payments.id, params.id) });
  if (!p || p.userId !== userId) throw new ApiError(404, "Payment not found.", "not_found");
  const sub = p.subscriptionId ? await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.id, p.subscriptionId) }) : null;
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  const name = planName(p.planCode);
  const terms: string[] = [`${formatMoney(p.amountMinor, p.currency)} today.`];
  if (sub?.kind === "PASS") terms.push("One-off pass — it doesn't renew.");
  else if (sub?.nextChargeAt) {
    terms.push(`Then ${formatMoney(sub.amountMinor, sub.currency)} every ${sub.periodDays === 30 ? "month" : `${sub.periodDays} days`}, starting ${formatDate(sub.nextChargeAt)}, until you cancel.`);
    terms.push("Cancel any time in the app before then and you won't be charged again.");
  }
  return ok({
    payment: { id: p.id, status: p.status, amountMinor: p.amountMinor, currency: p.currency, planName: name, failureReason: p.failureReason },
    terms,
    provider: p.provider,
    razorpay: p.provider === "RAZORPAY" && sub?.providerRef ? {
      keyId: process.env.RAZORPAY_KEY_ID, name: "Project Connect", description: name,
      ...(sub.kind === "PASS" ? { order_id: sub.providerRef, amount: p.amountMinor, currency: p.currency } : { subscription_id: sub.providerRef }),
      prefill: { email: user?.email }, notes: { pc_payment_id: p.id }, theme: { color: "#7B48CC" },
    } : null,
  });
});
