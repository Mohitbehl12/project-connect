import "server-only";
import { z } from "zod";
import { getConfig } from "./config";
import { ApiError } from "./http";

// Validation for the Admin offer and coupon editors (kept out of route files, which may only export handlers).

export const OfferBody = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["INTRO", "DISCOUNT", "PASS"]),
  headline: z.string().trim().min(3).max(80),
  badge: z.string().trim().max(30).nullable().optional(),
  planCode: z.enum(["PREMIUM", "PREMIUM_PLUS", "VIP"]),
  country: z.string().regex(/^[A-Z]{2}$/),
  genders: z.array(z.enum(["MAN", "WOMAN", "NONBINARY"])).default([]),
  audience: z.enum(["ALL", "NEW", "RETURNING"]).default("ALL"),
  priceMinor: z.number().int().min(100).nullable().optional(),
  days: z.number().int().min(1).max(365).nullable().optional(),
  discountPct: z.number().int().min(1).max(90).nullable().optional(),
  oncePerUser: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(0),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  active: z.boolean().default(true),
});

export async function validateOffer(b: z.infer<typeof OfferBody>) {
  if (b.kind === "INTRO" && (!b.priceMinor || !b.days)) throw new ApiError(422, "An intro offer needs a price and a number of days.", "validation");
  if (b.kind === "PASS" && (!b.priceMinor || !b.days)) throw new ApiError(422, "A pass needs a price and a number of days.", "validation");
  if (b.kind === "DISCOUNT" && !b.discountPct) throw new ApiError(422, "A discount needs a percentage.", "validation");
  if (b.startsAt && b.endsAt && b.endsAt <= b.startsAt) throw new ApiError(422, "The end date must be after the start date.", "validation");
  if (b.genders.length && !(await getConfig("billing.genderPricingCountries")).includes(b.country))
    throw new ApiError(422, `Gender-specific offers aren't enabled for ${b.country}. They're unlawful in some countries — check with a lawyer, then add the country in Settings.`, "gender_pricing_off");
}

export const CouponBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,20}$/, "Codes are 4–20 letters or numbers"),
  kind: z.enum(["PERCENT", "FIXED"]),
  value: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
  maxDiscountMinor: z.number().int().positive().nullable().optional(),
  minPurchaseMinor: z.number().int().positive().nullable().optional(),
  audience: z.enum(["ALL", "NEW", "EXISTING"]).default("ALL"),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).default([]),
  plans: z.array(z.enum(["PREMIUM", "PREMIUM_PLUS", "VIP"])).default([]),
  genders: z.array(z.enum(["MAN", "WOMAN", "NONBINARY"])).default([]),
  usageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().min(1).max(10).default(1),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  active: z.boolean().default(true),
});

export async function validateCoupon(b: z.infer<typeof CouponBody>) {
  if (b.kind === "PERCENT" && b.value > 100) throw new ApiError(422, "A percentage can't be over 100.", "validation");
  if (b.kind === "FIXED" && !b.currency) throw new ApiError(422, "A fixed discount needs a currency.", "validation");
  if (b.genders.length) {
    const allowed = await getConfig("billing.genderPricingCountries");
    if (!b.countries.length || b.countries.some((c) => !allowed.includes(c)))
      throw new ApiError(422, "Gender-specific coupons must be limited to countries where gender pricing is enabled.", "gender_pricing_off");
  }
}

export const couponShape = (b: z.infer<typeof CouponBody>) => ({ ...b, countries: b.countries.join(","), plans: b.plans.join(","), genders: b.genders.join(",") });

