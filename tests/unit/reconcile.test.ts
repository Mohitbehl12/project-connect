import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, schema: {} }));
vi.mock("../../src/lib/ops", () => ({ recordIncident: vi.fn() }));

import { diffPayments, hasDifferences, type GatewayPayment, type LocalPayment } from "../../src/lib/payments/reconcile";

const g = (id: string, over: Partial<GatewayPayment> = {}): GatewayPayment => ({ id, amount: 10000, currency: "INR", status: "captured", createdAt: 0, ...over });
const l = (id: string | null, over: Partial<LocalPayment> = {}): LocalPayment => ({ providerPaymentId: id, amountMinor: 10000, currency: "INR", status: "CAPTURED", ...over });

describe("payment reconciliation", () => {
  it("finds nothing when both sides agree", () => {
    const d = diffPayments([g("pay_1"), g("pay_2", { status: "refunded" })], [l("pay_1"), l("pay_2", { status: "REFUNDED" })]);
    expect(hasDifferences(d)).toBe(false);
  });
  it("reports a payment captured at the gateway that we never recorded", () => {
    expect(diffPayments([g("pay_1"), g("pay_lost")], [l("pay_1")]).missingLocally).toEqual(["pay_lost"]);
  });
  it("reports a payment the gateway captured but we still show as created or failed", () => {
    const d = diffPayments([g("pay_1"), g("pay_2")], [l("pay_1", { status: "CREATED" }), l("pay_2", { status: "FAILED" })]);
    expect(d.notCapturedLocally).toEqual(["pay_1", "pay_2"]);
    expect(d.missingLocally).toEqual([]);
  });
  it("reports a different amount or currency", () => {
    const d = diffPayments([g("pay_1", { amount: 100 }), g("pay_2", { currency: "USD" }), g("pay_3")], [l("pay_1"), l("pay_2"), l("pay_3", { currency: "inr" })]);
    expect(d.amountMismatch).toEqual(["pay_1", "pay_2"]);
  });
  it("reports a payment we call captured that the gateway says failed", () => {
    expect(diffPayments([g("pay_1", { status: "failed" })], [l("pay_1")]).notCapturedAtGateway).toEqual(["pay_1"]);
  });
  it("ignores gateway payments that were never captured, and local rows with no gateway id", () => {
    const d = diffPayments([g("pay_1", { status: "failed" }), g("pay_2", { status: "created" })], [l(null, { status: "CREATED" })]);
    expect(hasDifferences(d)).toBe(false);
  });
  it("does not call a local payment wrong just because it is outside the gateway window", () => {
    expect(hasDifferences(diffPayments([], [l("pay_old")]))).toBe(false);
  });
});
