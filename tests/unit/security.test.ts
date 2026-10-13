import { describe, expect, it, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import { open, openSafe, resetKeyring, seal } from "../../src/lib/crypto";
import { parseRazorpayEvent, verifyWebhookSignature } from "../../src/lib/payments/razorpay";
import { friendlyFailure } from "../../src/lib/payments/types";
import { totpAt, verifyTotp, newTotpSecret } from "../../src/lib/totp";
import { levelFor } from "../../src/lib/risk";

beforeAll(() => {
  process.env.FIELD_KEYS = `v1:${Buffer.alloc(32, 1).toString("base64")},v2:${Buffer.alloc(32, 2).toString("base64")}`;
  process.env.FIELD_KEY_ACTIVE = "v2";
  resetKeyring();
});

describe("field encryption (AES-256-GCM)", () => {
  it("round-trips, uses a fresh IV, and doesn't leak plaintext", () => {
    const a = seal("meet at the café at 6", "match-1"), b = seal("meet at the café at 6", "match-1");
    expect(a).not.toBe(b);
    expect(a).not.toContain("café");
    expect(a.startsWith("enc:v2:")).toBe(true);
    expect(open(a, "match-1")).toBe("meet at the café at 6");
  });
  it("detects tampering and wrong context", () => {
    const a = seal("hello", "match-1");
    const parts = a.split(":"); parts[4] = Buffer.from("tampered").toString("base64url");
    expect(() => open(parts.join(":"), "match-1")).toThrow();
    expect(() => open(a, "match-2")).toThrow(); // bound to its conversation
    expect(openSafe(parts.join(":"), "match-1")).toBe("[message unavailable]");
  });
  it("still reads values sealed with an older key, and plain legacy text", () => {
    process.env.FIELD_KEY_ACTIVE = "v1"; resetKeyring();
    const old = seal("old message");
    process.env.FIELD_KEY_ACTIVE = "v2"; resetKeyring();
    expect(open(old)).toBe("old message");
    expect(open("written before encryption")).toBe("written before encryption");
  });
});

describe("Razorpay webhooks", () => {
  const secret = "whsec_test_123";
  it("accepts only the right HMAC-SHA256 signature", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "00" + sig.slice(2), secret)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, sig, undefined)).toBe(false);
  });
  it("normalises captured, failed, renewal-pending, refund and dispute events", () => {
    expect(parseRazorpayEvent({ event: "subscription.charged", payload: { subscription: { entity: { id: "sub_1" } }, payment: { entity: { id: "pay_1", status: "captured", amount: 10000, currency: "INR", method: "upi" } } } }))
      .toEqual([{ t: "CAPTURED", providerPaymentId: "pay_1", amountMinor: 10000, currency: "INR", method: "upi", orderId: null, subRef: "sub_1", ourPaymentId: null }]);
    expect(parseRazorpayEvent({ event: "payment.failed", payload: { payment: { entity: { id: "pay_2", error_reason: "payment_failed", error_description: "Declined", notes: { pc_payment_id: "p1" } } } } })[0]).toMatchObject({ t: "FAILED", ourPaymentId: "p1" });
    expect(parseRazorpayEvent({ event: "subscription.pending", payload: { subscription: { entity: { id: "sub_1" } } } })).toEqual([{ t: "SUB_PAST_DUE", subRef: "sub_1" }]);
    expect(parseRazorpayEvent({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 5000 } } } })[0]).toMatchObject({ t: "REFUND_PROCESSED", amountMinor: 5000 });
    expect(parseRazorpayEvent({ event: "payment.dispute.created", payload: { dispute: { entity: { payment_id: "pay_1", amount: 100 } } } })[0]).toMatchObject({ t: "DISPUTE" });
    expect(parseRazorpayEvent({ event: "something.else" })).toEqual([]);
  });
  it("failure messages are friendly and never echo account numbers", () => {
    expect(friendlyFailure("INSUFFICIENT_FUNDS")).toMatch(/enough balance/);
    expect(friendlyFailure("X", "Card 4111111111111111 declined")).toBe("We couldn't process your payment.");
  });
});

describe("2-step codes (TOTP)", () => {
  it("matches the RFC 6238 test vector", () => {
    // RFC 6238 SHA1 vector, secret "12345678901234567890" in base32; T=59s → 94287082 (last 6: 287082)
    expect(totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
  });
  it("accepts the current and adjacent windows only", () => {
    const s = newTotpSecret();
    const t = Date.now();
    expect(verifyTotp(s, totpAt(s, t), t)).toBe(true);
    expect(verifyTotp(s, totpAt(s, t - 30_000), t)).toBe(true);
    expect(verifyTotp(s, totpAt(s, t - 120_000), t)).toBe(false);
    expect(verifyTotp(s, "abc123", t)).toBe(false);
  });
});

describe("risk levels", () => {
  it("adds up signals into Low / Medium / High", () => {
    expect(levelFor(0)).toBe("LOW");
    expect(levelFor(29)).toBe("LOW");
    expect(levelFor(30)).toBe("MEDIUM");
    expect(levelFor(60)).toBe("HIGH");
  });
});
