import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { subscriptionSummary } from "@/lib/billing";
import { ApiError, ok, publicRoute } from "@/lib/http";
import { verifyScoped } from "@/lib/paytoken";

/** Status of one payment, for the app (session) or the pay page (scoped token) to poll after checkout. */
export const GET = publicRoute<{ id: string }>(async ({ req, params }) => {
  const token = new URL(req.url).searchParams.get("t");
  const userId = (await currentUser())?.id ?? (await verifyScoped(token, "pay", params.id));
  if (!userId) throw new ApiError(401, "Please log in to continue.", "unauthenticated");
  const p = await db.query.payments.findFirst({ where: eq(schema.payments.id, params.id) });
  if (!p || p.userId !== userId) throw new ApiError(404, "Payment not found.", "not_found");
  return ok({
    payment: { id: p.id, status: p.status, amountMinor: p.amountMinor, currency: p.currency, planCode: p.planCode, invoiceNo: p.invoiceNo, failureReason: p.failureReason, paidAt: p.paidAt, providerPaymentId: p.status === "CAPTURED" ? p.providerPaymentId : null },
    subscription: await subscriptionSummary(userId),
  });
});
