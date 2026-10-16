// Pricing engine — pure functions, no database. Decides which price, offer and coupon apply to a buyer
// and produces a quote that says exactly what they pay today, what they pay after, and when.
// Rules (kept deliberately simple so they can be explained on one screen):
//  • A price can have groups ("gender:MAN"); group prices and gender-limited offers only apply in
//    countries listed in billing.genderPricingCountries. Everyone else gets the "*" price.
//  • An INTRO offer (e.g. ₹1 for 15 days) is once per person; a coupon can't be combined with it.
//  • A DISCOUNT offer or a coupon reduces today's payment only; the larger of the two wins.
//  • A PASS is a one-off purchase that never renews.

export type PriceRow = {
  id: string; planCode: string; country: string; currency: string; amountMinor: number; durationDays: number; segment: string;
};
export type OfferRow = {
  id: string; kind: string; headline: string; badge: string | null; planCode: string; country: string; genders: string;
  audience: string; priceMinor: number | null; days: number | null; discountPct: number | null; oncePerUser: boolean;
  priority: number; startsAt: Date | null; endsAt: Date | null; active: boolean;
};
export type CouponRow = {
  id: string; code: string; kind: string; value: number; currency: string | null; maxDiscountMinor: number | null;
  minPurchaseMinor: number | null; audience: string; countries: string; plans: string; genders: string;
  usageLimit: number | null; perUserLimit: number; usedCount: number; startsAt: Date | null; endsAt: Date | null; active: boolean;
};
export type Buyer = {
  gender: string | null;
  country: string;
  everPaid: boolean; // has had any paid subscription
  activeNow: boolean; // has Premium right now
  introUsed: boolean; // has used an intro offer (by account, phone or device)
  usedOfferIds: string[];
  couponUses: Record<string, number>; // couponId → times this user redeemed it
};

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const inWindow = (now: Date, start: Date | null, end: Date | null) => (!start || start <= now) && (!end || end > now);

export function genderPricingOn(country: string, genderCountries: string[]) {
  return genderCountries.includes(country);
}

/**
 * The prices a buyer can choose for a plan (one per billing period), shortest first.
 * Country first (or "*"); then, in gender-pricing countries, the buyer's group — and if their group
 * has its own prices for this plan, only those are offered (they never fall back to another group's).
 */
export function priceOptions<T extends PriceRow>(prices: T[], planCode: string, buyer: Buyer, genderCountries: string[]): T[] {
  const forPlan = prices.filter((p) => p.planCode === planCode);
  const local = forPlan.filter((p) => p.country === buyer.country);
  const pool = local.length ? local : forPlan.filter((p) => p.country === "*");
  let rows = pool.filter((p) => p.segment === "*");
  if (genderPricingOn(buyer.country, genderCountries) && buyer.gender) {
    const grouped = pool.filter((p) => p.segment === `gender:${buyer.gender}`);
    if (grouped.length) rows = grouped;
  }
  const byPeriod = new Map<number, T>();
  for (const r of rows) if (!byPeriod.has(r.durationDays)) byPeriod.set(r.durationDays, r);
  return [...byPeriod.values()].sort((a, b) => a.durationDays - b.durationDays);
}

/** One price: the requested billing period, or by default the monthly one (else the shortest). */
export function pickPrice<T extends PriceRow>(prices: T[], planCode: string, buyer: Buyer, genderCountries: string[], durationDays?: number | null): T | null {
  const opts = priceOptions(prices, planCode, buyer, genderCountries);
  if (durationDays) return opts.find((p) => p.durationDays === durationDays) ?? null;
  return opts.find((p) => p.durationDays === 30 || p.durationDays === 31) ?? opts[0] ?? null;
}

/** Introductory and discount offers are written for the monthly price ("first month"), so only apply there. */
export const offersApplyTo = (durationDays: number) => durationDays <= 31;

function audienceOk(audience: string, buyer: Buyer) {
  if (audience === "NEW") return !buyer.everPaid;
  if (audience === "RETURNING") return buyer.everPaid && !buyer.activeNow;
  if (audience === "EXISTING") return buyer.everPaid;
  return true;
}

function gendersOk(genders: string, buyer: Buyer, genderCountries: string[]) {
  const g = list(genders);
  if (!g.length) return true;
  // A gender-limited offer or coupon simply doesn't exist outside gender-pricing countries.
  if (!genderPricingOn(buyer.country, genderCountries)) return false;
  return !!buyer.gender && g.includes(buyer.gender);
}

/** Offers this buyer can use for a plan, best first (priority, then the more specific one). */
export function eligibleOffers(offers: OfferRow[], planCode: string, buyer: Buyer, now: Date, genderCountries: string[]): OfferRow[] {
  return offers
    .filter((o) => o.active && o.planCode === planCode && o.country === buyer.country && inWindow(now, o.startsAt, o.endsAt))
    .filter((o) => gendersOk(o.genders, buyer, genderCountries) && audienceOk(o.audience, buyer))
    .filter((o) => !(o.oncePerUser && buyer.usedOfferIds.includes(o.id)))
    .filter((o) => !(o.kind === "INTRO" && (buyer.introUsed || buyer.activeNow)))
    .filter((o) => o.kind !== "PASS" || !buyer.activeNow)
    .sort((a, b) => b.priority - a.priority || list(b.genders).length - list(a.genders).length);
}

export type CouponCheck = { ok: true; discountMinor: number } | { ok: false; reason: string };

/** Validates a coupon against a buyer and an amount; returns the discount it gives. */
export function checkCoupon(c: CouponRow | null, ctx: { buyer: Buyer; planCode: string; amountMinor: number; currency: string; now: Date; genderCountries: string[] }): CouponCheck {
  if (!c || !c.active) return { ok: false, reason: "That code isn't valid." };
  if (c.startsAt && c.startsAt > ctx.now) return { ok: false, reason: "That code isn't active yet." };
  if (c.endsAt && c.endsAt <= ctx.now) return { ok: false, reason: "That code has expired." };
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return { ok: false, reason: "That code has been fully used." };
  if ((ctx.buyer.couponUses[c.id] ?? 0) >= c.perUserLimit) return { ok: false, reason: "You've already used this code." };
  if (list(c.countries).length && !list(c.countries).includes(ctx.buyer.country)) return { ok: false, reason: "That code isn't available in your country." };
  if (list(c.plans).length && !list(c.plans).includes(ctx.planCode)) return { ok: false, reason: "That code doesn't apply to this plan." };
  if (!gendersOk(c.genders, ctx.buyer, ctx.genderCountries)) return { ok: false, reason: "That code isn't available on your account." };
  if (!audienceOk(c.audience, ctx.buyer)) return { ok: false, reason: c.audience === "NEW" ? "That code is for first-time subscribers." : "That code is for existing members." };
  if (c.minPurchaseMinor !== null && ctx.amountMinor < c.minPurchaseMinor) return { ok: false, reason: "That code needs a bigger plan." };
  let off = 0;
  if (c.kind === "PERCENT") off = Math.round((ctx.amountMinor * Math.min(100, Math.max(0, c.value))) / 100);
  else {
    if (c.currency && c.currency !== ctx.currency) return { ok: false, reason: "That code isn't available in your currency." };
    off = c.value;
  }
  if (c.maxDiscountMinor !== null) off = Math.min(off, c.maxDiscountMinor);
  off = Math.min(off, ctx.amountMinor - minimumCharge(ctx.currency)); // a payment can't be free or negative
  if (off <= 0) return { ok: false, reason: "That code doesn't lower this price." };
  return { ok: true, discountMinor: off };
}

/** Gateways need a real payment to set up auto-renew; ₹1 / 1 unit is the floor. */
export function minimumCharge(currency: string) {
  return currency === "INR" ? 100 : 50;
}

export type Quote = {
  planCode: string;
  kind: "RECURRING" | "PASS";
  currency: string;
  priceId: string;
  regularMinor: number;
  periodDays: number;
  todayMinor: number;
  discountMinor: number;
  offer: { id: string; kind: string; headline: string; badge: string | null; endsAt: Date | null } | null;
  coupon: { code: string; discountMinor: number } | null;
  couponError: string | null;
  introDays: number | null;
  accessUntil: Date;
  nextChargeAt: Date | null;
  nextChargeMinor: number | null;
  terms: string[];
};

export function formatMoney(minor: number, currency: string) {
  const v = minor / 100;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-GB", {
    style: "currency", currency, minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2,
  }).format(v);
}

export function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

const days = (n: number) => n * 86_400_000;
export const periodWord = (d: number) =>
  d === 30 || d === 31 ? "month" : d === 7 ? "week" : d === 365 || d === 366 ? "year" : d % 30 === 0 ? `${d / 30} months` : `${d} days`;

/**
 * Builds the quote. `offer` is the best eligible offer (or null); `coupon` is what the person typed.
 * A coupon replaces an INTRO offer (they don't combine) and competes with a DISCOUNT offer.
 */
export function buildQuote(args: {
  price: PriceRow; offer: OfferRow | null; coupon?: { row: CouponRow | null; code: string } | null;
  buyer: Buyer; now: Date; genderCountries: string[]; reminderDays: number;
}): Quote {
  const { price, buyer, now } = args;
  const cur = price.currency;
  const base = price.amountMinor;
  let offer = args.offer;
  let couponOut: Quote["coupon"] = null;
  let couponError: string | null = null;

  if (offer?.kind === "PASS") {
    const passDays = offer.days ?? 1;
    const amount = offer.priceMinor ?? base;
    return {
      planCode: price.planCode, kind: "PASS", currency: cur, priceId: price.id, regularMinor: base, periodDays: passDays,
      todayMinor: amount, discountMinor: 0, offer: pickOffer(offer), coupon: null, couponError: null, introDays: null,
      accessUntil: new Date(now.getTime() + days(passDays)), nextChargeAt: null, nextChargeMinor: null,
      terms: [
        `${formatMoney(amount, cur)} once for ${passDays === 1 ? "1 day" : `${passDays} days`} of ${planName(price.planCode)}.`,
        "This is a one-off pass. It doesn't renew and you won't be charged again.",
      ],
    };
  }

  let today = base;
  let discount = 0;
  let introDays: number | null = null;

  const couponCheck = args.coupon ? checkCoupon(args.coupon.row, { buyer, planCode: price.planCode, amountMinor: base, currency: cur, now, genderCountries: args.genderCountries }) : null;
  if (couponCheck && !couponCheck.ok) couponError = couponCheck.reason;

  if (couponCheck?.ok) {
    const offerDiscount = offer?.kind === "DISCOUNT" ? Math.round((base * (offer.discountPct ?? 0)) / 100) : 0;
    if (couponCheck.discountMinor >= offerDiscount) {
      offer = null; // the coupon wins (and an intro offer never combines with a coupon)
      discount = couponCheck.discountMinor;
      couponOut = { code: args.coupon!.code.toUpperCase(), discountMinor: discount };
    } else {
      couponError = "Your current offer already gives a bigger discount.";
    }
  }

  // Discounts land on whole rupees (₹124.50 → ₹125): prices with paise look untidy and harder to trust.
  const tidy = (minor: number) => (cur === "INR" ? Math.round(minor / 100) * 100 : minor);

  if (offer?.kind === "INTRO") {
    today = Math.max(minimumCharge(cur), offer.priceMinor ?? minimumCharge(cur));
    introDays = offer.days ?? price.durationDays;
  } else if (offer?.kind === "DISCOUNT") {
    discount = Math.min(base - minimumCharge(cur), Math.round((base * (offer.discountPct ?? 0)) / 100));
    today = Math.max(minimumCharge(cur), tidy(base - discount));
    discount = base - today;
  } else if (couponOut) {
    today = Math.max(minimumCharge(cur), tidy(base - discount));
    discount = base - today;
    couponOut.discountMinor = discount;
  }

  const firstPeriod = introDays ?? price.durationDays;
  const nextChargeAt = new Date(now.getTime() + days(firstPeriod));
  const per = periodWord(price.durationDays);
  const name = planName(price.planCode);
  const terms: string[] = [];
  if (introDays) terms.push(`${formatMoney(today, cur)} today for ${introDays} days of ${name}.`);
  else if (discount) terms.push(`${formatMoney(today, cur)} today for your first ${per} (${formatMoney(discount, cur)} off).`);
  else terms.push(`${formatMoney(today, cur)} today for your first ${per} of ${name}.`);
  terms.push(`Then ${formatMoney(base, cur)} every ${per}, starting ${formatDate(nextChargeAt)}, until you cancel.`);
  terms.push(`Cancel any time before ${formatDate(nextChargeAt)} and you won't be charged again. You keep ${name} until then.`);
  terms.push(`It renews automatically. We'll remind you ${args.reminderDays} days before each charge.`);

  return {
    planCode: price.planCode, kind: "RECURRING", currency: cur, priceId: price.id, regularMinor: base, periodDays: price.durationDays,
    todayMinor: today, discountMinor: discount, offer: offer ? pickOffer(offer) : null, coupon: couponOut, couponError, introDays,
    accessUntil: nextChargeAt, nextChargeAt, nextChargeMinor: base, terms,
  };
}

function pickOffer(o: OfferRow) {
  return { id: o.id, kind: o.kind, headline: o.headline, badge: o.badge, endsAt: o.endsAt };
}

export function planName(code: string) {
  return { PREMIUM: "Premium", PREMIUM_PLUS: "Premium Plus", VIP: "VIP" }[code] ?? code;
}
