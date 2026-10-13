import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { CouponBody, couponShape, validateCoupon } from "@/lib/admin-billing";

export const PUT = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, CouponBody);
  await validateCoupon(b);
  const before = await db.query.coupons.findFirst({ where: eq(schema.coupons.id, params.id) });
  if (!before) throw new ApiError(404, "Coupon not found.", "not_found");
  await db.update(schema.coupons).set(couponShape(b)).where(eq(schema.coupons.id, params.id));
  await audit(user.id, "coupon.update", "coupon", params.id, { before, after: b });
  return ok({ saved: true });
}, { permission: "coupons.edit" });
