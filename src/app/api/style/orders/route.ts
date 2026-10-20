import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { SpecBody, createOrder, myOrders } from "@/lib/style/server";

export const GET = route(async ({ user }) => ok({ orders: await myOrders(user.id) }));
const Body = z.object({
  spec: SpecBody, profileId: z.string().max(64), notes: z.string().max(600).optional(),
  address: z.string().trim().min(10, "address: Add a delivery address (house, street, city, PIN)").max(400),
  acceptTerms: z.literal(true, { message: "acceptTerms: Please confirm the price and delivery date" }),
});
/** Places an order. The price is recalculated here; payment happens on the next screen. */
export const POST = route(async ({ req, user }) => {
  await rateLimit(`style-order:${user.id}`, 20, 60 * 60_000);
  return ok(await createOrder(user, await parseBody(req, Body)), 201);
});
