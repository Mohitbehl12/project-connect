import { z } from "zod";
import { quoteFor } from "@/lib/billing";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({ planCode: z.string().min(1).max(30), coupon: z.string().max(40).optional().nullable(), offerId: z.string().max(60).optional().nullable() });

export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  if (b.coupon) rateLimit(`coupon:${user.id}`, 20, 60 * 60_000); // stops guessing codes
  return ok({ quote: await quoteFor(user, b.planCode, { coupon: b.coupon, offerId: b.offerId }) });
});
