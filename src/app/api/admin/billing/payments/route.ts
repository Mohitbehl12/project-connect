import { and, desc, eq, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { planName } from "@/lib/pricing";

/** Payment list for finance and support. No card, UPI or bank details exist here — the gateway holds them. */
export const GET = route(async ({ req }) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim().toLowerCase();
  const rows = await db.select({ p: schema.payments, email: schema.users.email, subRef: schema.subscriptions.providerRef }).from(schema.payments)
    .innerJoin(schema.users, eq(schema.users.id, schema.payments.userId))
    .leftJoin(schema.subscriptions, eq(schema.subscriptions.id, schema.payments.subscriptionId))
    .where(and(
      status ? eq(schema.payments.status, status) : undefined,
      q ? or(like(schema.users.email, `%${q}%`), like(schema.payments.invoiceNo, `%${q.toUpperCase()}%`), eq(schema.payments.providerPaymentId, q), eq(schema.payments.id, q)) : undefined,
    ))
    .orderBy(desc(schema.payments.createdAt)).limit(100);
  const refunds = await db.select().from(schema.refunds).orderBy(desc(schema.refunds.createdAt)).limit(200);
  return ok({
    payments: rows.map(({ p, email, subRef }) => ({
      gatewayRef: subRef, // gateway subscription / order id, for reconciliation
      id: p.id, userId: p.userId, email, status: p.status, purpose: p.purpose, plan: planName(p.planCode), amountMinor: p.amountMinor, currency: p.currency,
      refundedMinor: p.refundedMinor, discountMinor: p.discountMinor, couponCode: p.couponCode, method: p.method, provider: p.provider,
      providerPaymentId: p.providerPaymentId, invoiceNo: p.invoiceNo, failureReason: p.failureReason, disputed: p.disputed, createdAt: p.createdAt, paidAt: p.paidAt,
      openRefund: refunds.find((r) => r.paymentId === p.id && ["REQUESTED", "APPROVED"].includes(r.status))?.id ?? null,
    })),
  });
}, { permission: "payments.view" });
