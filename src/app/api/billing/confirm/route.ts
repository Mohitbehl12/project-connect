import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { providerByName } from "@/lib/billing";
import { ApiError, ok, parseBody, publicRoute } from "@/lib/http";
import { verifyScoped } from "@/lib/paytoken";

const Body = z.object({ paymentId: z.string().min(1), token: z.string().min(10), providerPaymentId: z.string().min(1).max(80), signature: z.string().min(1).max(200) });

/**
 * Called by the pay page after the gateway's checkout closes. It only checks the signature so the page
 * can show the right message; Premium is switched on by the signed webhook, never by this call.
 */
export const POST = publicRoute(async ({ req }) => {
  const b = await parseBody(req, Body);
  const userId = await verifyScoped(b.token, "pay", b.paymentId);
  if (!userId) throw new ApiError(401, "This payment link has expired. Please start again from the app.", "token");
  const p = await db.query.payments.findFirst({ where: eq(schema.payments.id, b.paymentId) });
  if (!p || p.userId !== userId) throw new ApiError(404, "Payment not found.", "not_found");
  const sub = p.subscriptionId ? await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.id, p.subscriptionId) }) : null;
  const provider = providerByName(p.provider);
  const verified = !!(provider && sub?.providerRef && provider.verifyClientResult({ providerRef: sub.providerRef, kind: sub.kind as "RECURRING" | "PASS", paymentId: b.providerPaymentId, signature: b.signature }));
  return ok({ verified, status: p.status });
});
