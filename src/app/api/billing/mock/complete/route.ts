import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { applyEvent, mockAllowed } from "@/lib/billing";
import { currentUser } from "@/lib/auth";
import { ApiError, ok, parseBody, publicRoute } from "@/lib/http";
import { verifyScoped } from "@/lib/paytoken";

// TEST MODE ONLY — stands in for the gateway so the whole flow (success, failure, renewal) can be tried
// without real money. Disabled in production unless ENABLE_MOCK_PAYMENTS="true".
const Body = z.object({
  paymentId: z.string().min(1),
  token: z.string().optional(),
  outcome: z.enum(["success", "fail"]),
  method: z.enum(["upi", "card", "netbanking", "wallet"]).default("upi"),
});

export const POST = publicRoute(async ({ req }) => {
  if (!mockAllowed()) throw new ApiError(404, "Not found.", "not_found");
  const b = await parseBody(req, Body);
  const userId = (await currentUser())?.id ?? (await verifyScoped(b.token, "pay", b.paymentId));
  const p = await db.query.payments.findFirst({ where: eq(schema.payments.id, b.paymentId) });
  if (!userId || !p || p.userId !== userId) throw new ApiError(404, "Payment not found.", "not_found");
  if (p.provider !== "MOCK") throw new ApiError(409, "This isn't a test payment.", "not_mock");
  if (p.status !== "CREATED") return ok({ result: "already_processed", status: p.status });
  const fake = `mock_pay_${crypto.randomUUID().slice(0, 12)}`;
  const result = b.outcome === "success"
    ? await applyEvent({ t: "CAPTURED", providerPaymentId: fake, amountMinor: p.amountMinor, currency: p.currency, method: b.method, ourPaymentId: p.id, internal: true })
    : await applyEvent({ t: "FAILED", providerPaymentId: fake, ourPaymentId: p.id, internal: true, code: "BAD_REQUEST_ERROR", description: "Payment declined by bank (test)" });
  return ok({ result });
});
