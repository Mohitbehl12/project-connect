// TEST PROVIDER — no money moves. Used in development and automated tests, and only when
// ENABLE_MOCK_PAYMENTS="true". Checkout opens a clearly labelled test page where you pick success or failure.
import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "./types";

export const mockProvider: PaymentProvider = {
  name: "MOCK",
  async createCheckout(req) {
    const ref = (req.kind === "PASS" ? "mock_order_" : "mock_sub_") + randomUUID().slice(0, 12);
    return { provider: "MOCK", providerRef: ref, providerOrderId: req.kind === "PASS" ? ref : undefined, client: { mode: "test" } };
  },
  verifyClientResult: () => true,
  async cancelAtCycleEnd() {},
  async resume() {},
  async changePlanAtCycleEnd() {},
  async refund() {
    return { providerRefundId: "mock_rfnd_" + randomUUID().slice(0, 12), status: "PROCESSED" };
  },
};
