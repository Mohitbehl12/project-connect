import { describe, expect, it } from "vitest";
import { buildQuote, checkCoupon, eligibleOffers, pickPrice, type Buyer, type CouponRow, type OfferRow, type PriceRow } from "../../src/lib/pricing";

const now = new Date("2026-10-13T10:00:00Z");
const IN = ["IN"];
const prices: PriceRow[] = [
  { id: "man", planCode: "PREMIUM", country: "IN", currency: "INR", amountMinor: 10000, durationDays: 30, segment: "gender:MAN" },
  { id: "rest", planCode: "PREMIUM", country: "IN", currency: "INR", amountMinor: 5000, durationDays: 30, segment: "*" },
  { id: "us", planCode: "PREMIUM", country: "US", currency: "USD", amountMinor: 1499, durationDays: 30, segment: "*" },
  { id: "any", planCode: "PREMIUM", country: "*", currency: "USD", amountMinor: 1499, durationDays: 30, segment: "*" },
];
const buyer = (o: Partial<Buyer> = {}): Buyer => ({ gender: "WOMAN", country: "IN", everPaid: false, activeNow: false, introUsed: false, usedOfferIds: [], couponUses: {}, ...o });
const offer = (o: Partial<OfferRow>): OfferRow => ({ id: "o", kind: "INTRO", headline: "Try Premium for ₹1", badge: null, planCode: "PREMIUM", country: "IN", genders: "", audience: "NEW", priceMinor: 100, days: 30, discountPct: null, oncePerUser: true, priority: 10, startsAt: null, endsAt: null, active: true, ...o });
const coupon = (o: Partial<CouponRow>): CouponRow => ({ id: "c", code: "WELCOME50", kind: "PERCENT", value: 50, currency: null, maxDiscountMinor: null, minPurchaseMinor: null, audience: "ALL", countries: "", plans: "", genders: "", usageLimit: null, perUserLimit: 1, usedCount: 0, startsAt: null, endsAt: null, active: true, ...o });
const offers = [offer({ id: "men", genders: "MAN", days: 15 }), offer({ id: "rest", genders: "", days: 30 })];

describe("price groups", () => {
  it("men pay the men's price in India; everyone else pays the default", () => {
    expect(pickPrice(prices, "PREMIUM", buyer({ gender: "MAN" }), IN)?.amountMinor).toBe(10000);
    expect(pickPrice(prices, "PREMIUM", buyer({ gender: "WOMAN" }), IN)?.amountMinor).toBe(5000);
    expect(pickPrice(prices, "PREMIUM", buyer({ gender: "NONBINARY" }), IN)?.amountMinor).toBe(5000);
    expect(pickPrice(prices, "PREMIUM", buyer({ gender: null }), IN)?.amountMinor).toBe(5000);
  });
  it("ignores gender groups where gender pricing is off", () => {
    expect(pickPrice(prices, "PREMIUM", buyer({ gender: "MAN" }), [])?.amountMinor).toBe(5000);
  });
  it("falls back to the * country price", () => {
    expect(pickPrice(prices, "PREMIUM", buyer({ country: "FR" }), IN)?.id).toBe("any");
  });
});

describe("intro offers", () => {
  it("men get ₹1 for 15 days, then ₹100/month", () => {
    const b = buyer({ gender: "MAN" });
    const best = eligibleOffers(offers, "PREMIUM", b, now, IN)[0];
    expect(best.id).toBe("men");
    const q = buildQuote({ price: pickPrice(prices, "PREMIUM", b, IN)!, offer: best, buyer: b, now, genderCountries: IN, reminderDays: 2 });
    expect(q.todayMinor).toBe(100);
    expect(q.introDays).toBe(15);
    expect(q.nextChargeMinor).toBe(10000);
    expect(q.nextChargeAt?.toISOString()).toBe("2026-10-28T10:00:00.000Z");
    expect(q.terms.join(" ")).toMatch(/₹1 today for 15 days.*Then ₹100 every month, starting 28 Oct 2026/);
  });
  it("women and everyone else get ₹1 for a month, then ₹50/month", () => {
    for (const g of ["WOMAN", "NONBINARY", null]) {
      const b = buyer({ gender: g });
      const best = eligibleOffers(offers, "PREMIUM", b, now, IN)[0];
      expect(best.id).toBe("rest");
      const q = buildQuote({ price: pickPrice(prices, "PREMIUM", b, IN)!, offer: best, buyer: b, now, genderCountries: IN, reminderDays: 2 });
      expect([q.todayMinor, q.introDays, q.nextChargeMinor]).toEqual([100, 30, 5000]);
    }
  });
  it("is once per person and not for people who've paid before", () => {
    expect(eligibleOffers(offers, "PREMIUM", buyer({ introUsed: true }), now, IN)).toHaveLength(0);
    expect(eligibleOffers(offers, "PREMIUM", buyer({ everPaid: true }), now, IN)).toHaveLength(0);
    expect(eligibleOffers(offers, "PREMIUM", buyer({ activeNow: true }), now, IN)).toHaveLength(0);
  });
  it("respects dates and country", () => {
    expect(eligibleOffers([offer({ endsAt: new Date("2026-10-01") })], "PREMIUM", buyer(), now, IN)).toHaveLength(0);
    expect(eligibleOffers([offer({ startsAt: new Date("2026-11-01") })], "PREMIUM", buyer(), now, IN)).toHaveLength(0);
    expect(eligibleOffers(offers, "PREMIUM", buyer({ country: "US" }), now, IN)).toHaveLength(0);
  });
  it("gender-limited offers don't exist outside gender-pricing countries", () => {
    expect(eligibleOffers([offer({ genders: "MAN", country: "GB" })], "PREMIUM", buyer({ gender: "MAN", country: "GB" }), now, IN)).toHaveLength(0);
  });
});

describe("coupons", () => {
  const ctx = { buyer: buyer(), planCode: "PREMIUM", amountMinor: 10000, currency: "INR", now, genderCountries: IN };
  it("percent with a cap", () => {
    expect(checkCoupon(coupon({ maxDiscountMinor: 3000 }), ctx)).toEqual({ ok: true, discountMinor: 3000 });
  });
  it("never makes a payment free", () => {
    expect(checkCoupon(coupon({ value: 100 }), ctx)).toEqual({ ok: true, discountMinor: 9900 });
  });
  it("refuses expired, used-up, already-used, wrong plan, wrong audience", () => {
    expect(checkCoupon(coupon({ endsAt: new Date("2026-01-01") }), ctx)).toMatchObject({ ok: false });
    expect(checkCoupon(coupon({ usageLimit: 5, usedCount: 5 }), ctx)).toMatchObject({ ok: false });
    expect(checkCoupon(coupon({}), { ...ctx, buyer: buyer({ couponUses: { c: 1 } }) })).toMatchObject({ ok: false });
    expect(checkCoupon(coupon({ plans: "VIP" }), ctx)).toMatchObject({ ok: false });
    expect(checkCoupon(coupon({ audience: "NEW" }), { ...ctx, buyer: buyer({ everPaid: true }) })).toMatchObject({ ok: false });
    expect(checkCoupon(null, ctx)).toMatchObject({ ok: false });
  });
  it("a coupon replaces the ₹1 intro rather than stacking", () => {
    const b = buyer();
    const q = buildQuote({ price: prices[1], offer: offers[1], coupon: { row: coupon({}), code: "welcome50" }, buyer: b, now, genderCountries: IN, reminderDays: 2 });
    expect(q.offer).toBeNull();
    expect(q.coupon).toEqual({ code: "WELCOME50", discountMinor: 2500 });
    expect(q.todayMinor).toBe(2500);
    expect(q.introDays).toBeNull();
    expect(q.nextChargeMinor).toBe(5000);
  });
  it("an invalid coupon leaves the offer in place and explains why", () => {
    const q = buildQuote({ price: prices[1], offer: offers[1], coupon: { row: null, code: "NOPE" }, buyer: buyer(), now, genderCountries: IN, reminderDays: 2 });
    expect(q.todayMinor).toBe(100);
    expect(q.couponError).toMatch(/isn't valid/);
  });
});

describe("passes", () => {
  it("a pass is one-off and says it never renews", () => {
    const q = buildQuote({ price: prices[1], offer: offer({ kind: "PASS", priceMinor: 4900, days: 3, oncePerUser: false }), buyer: buyer(), now, genderCountries: IN, reminderDays: 2 });
    expect(q.kind).toBe("PASS");
    expect(q.nextChargeAt).toBeNull();
    expect(q.terms.join(" ")).toMatch(/doesn't renew/);
  });
});
