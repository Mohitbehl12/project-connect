// Gateway-neutral payment types. The billing service only ever sees these normalised events,
// so Razorpay, the test provider and (later) Apple/Google all flow through the same logic.

export type CheckoutRequest = {
  ourPaymentId: string;
  ourSubscriptionId: string;
  kind: "RECURRING" | "PASS";
  planCode: string;
  planName: string;
  currency: string;
  todayMinor: number; // charged now (intro price, discounted first period or pass price)
  regularMinor: number; // charged every period after
  periodDays: number;
  firstChargeAt: Date | null; // when the first regular charge happens
  providerPlanId: string | null; // cached gateway plan id for this price
  customer: { name: string; email: string; phone: string | null };
};

export type CheckoutSession = {
  provider: string;
  providerRef: string; // gateway subscription or order id
  providerOrderId?: string;
  providerPlanId?: string; // newly created plan id to cache on the price
  client: Record<string, unknown>; // what the checkout page needs (never secrets)
};

export type BillingEvent =
  // `internal` is set only by our own server (test provider); gateway webhooks never set it.
  | { t: "CAPTURED"; providerPaymentId: string; amountMinor: number; currency: string; method: string | null; orderId?: string | null; subRef?: string | null; ourPaymentId?: string | null; internal?: boolean }
  | { t: "FAILED"; providerPaymentId?: string | null; orderId?: string | null; subRef?: string | null; ourPaymentId?: string | null; code: string; description: string | null; internal?: boolean }
  | { t: "SUB_PAST_DUE"; subRef: string }
  | { t: "SUB_HALTED"; subRef: string }
  | { t: "SUB_CANCELLED"; subRef: string }
  | { t: "REFUND_PROCESSED"; providerRefundId: string; providerPaymentId: string; amountMinor: number; ourRefundId?: string | null }
  | { t: "REFUND_FAILED"; providerRefundId: string }
  | { t: "DISPUTE"; providerPaymentId: string; amountMinor: number };

export interface PaymentProvider {
  name: "MOCK" | "RAZORPAY";
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Checks the signature the checkout returns to the browser. A hint only — webhooks are the source of truth. */
  verifyClientResult(input: { providerRef: string; kind: "RECURRING" | "PASS"; paymentId: string; signature: string }): boolean;
  cancelAtCycleEnd(providerRef: string): Promise<void>;
  resume(providerRef: string): Promise<void>;
  changePlanAtCycleEnd(providerRef: string, providerPlanId: string): Promise<void>;
  refund(providerPaymentId: string, amountMinor: number, note: string, ourRefundId: string): Promise<{ providerRefundId: string; status: "PROCESSED" | "PENDING" }>;
}

/** Turns a gateway decline code into wording a person can act on. Never echoes card or account details. */
export function friendlyFailure(code: string | null | undefined, description?: string | null): string {
  const c = (code ?? "").toUpperCase();
  if (c.includes("INSUFFICIENT")) return "Your bank says there wasn't enough balance.";
  if (c.includes("DECLINED") || c.includes("BAD_REQUEST_ERROR")) return "Your bank or card may have declined the payment.";
  if (c.includes("TIMEOUT") || c.includes("GATEWAY_ERROR") || c.includes("SERVER_ERROR")) return "The payment timed out. No money was taken — you can try again.";
  if (c.includes("CANCEL")) return "The payment was cancelled before it finished.";
  if (c.includes("MANDATE") || c.includes("AUTOPAY")) return "The auto-pay mandate wasn't approved. Try UPI Autopay or a card that supports it.";
  return description && description.length < 120 && !/\d{6,}/.test(description) ? description : "We couldn't process your payment.";
}
