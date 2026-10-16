import { z } from "zod";
import { applyStoreState, subscriptionSummary } from "@/lib/billing";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { googleSubscription, verifyAppleTransaction } from "@/lib/payments/stores";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  platform: z.enum(["ios", "android"]),
  token: z.string().min(10).max(20_000), // iOS: StoreKit 2 signed transaction · Android: purchase token
  productId: z.string().max(100).optional(),
});

/** The phone just bought (or renewed) through the store: verify it with the store, then turn Premium on. */
export const POST = route(async ({ req, user }) => {
  rateLimit(`store-verify:${user.id}`, 30, 60 * 60_000);
  const b = await parseBody(req, Body);
  const state = b.platform === "ios" ? await verifyAppleTransaction(b.token) : await googleSubscription(b.token);
  if (b.productId && b.productId !== state.productId) throw new ApiError(400, "That purchase doesn't match the plan you picked.", "store_mismatch");
  const r = await applyStoreState(state, { userId: user.id });
  return ok({ verified: true, status: r.applied ? r.status : null, subscription: await subscriptionSummary(user.id) });
});
