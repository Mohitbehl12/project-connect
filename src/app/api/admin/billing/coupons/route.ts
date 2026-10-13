import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { CouponBody, couponShape as shape, validateCoupon } from "@/lib/admin-billing";

export const GET = route(async () => ok({ coupons: await db.select().from(schema.coupons).orderBy(desc(schema.coupons.active), desc(schema.coupons.createdAt)) }), { permission: "coupons.edit" });

export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, CouponBody);
  await validateCoupon(b);
  const exists = await db.query.coupons.findFirst({ where: (c, { eq }) => eq(c.code, b.code) });
  if (exists) throw new ApiError(409, "That code already exists.", "duplicate");
  const [c] = await db.insert(schema.coupons).values({ ...shape(b), createdById: user.id }).returning();
  await audit(user.id, "coupon.create", "coupon", c.id, b);
  return ok({ coupon: c }, 201);
}, { permission: "coupons.edit" });

