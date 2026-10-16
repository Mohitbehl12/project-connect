import { z } from "zod";
import { applyStoreState, subscriptionSummary } from "@/lib/billing";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { googleSubscription, verifyAppleTransaction } from "@/lib/payments/stores";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  platform: z.enum(["ios", "android"]),
  tokens: z.array(z.string().min(10).max(20_000)).max(20),
});

/** "Restore purchases": the phone sends every subscription the store says this Apple/Google account owns. */
export const POST = route(async ({ req, user }) => {
  rateLimit(`store-restore:${user.id}`, 10, 60 * 60_000);
  const b = await parseBody(req, Body);
  let restored = 0;
  let otherAccount = false;
  for (const token of b.tokens) {
    try {
      const state = b.platform === "ios" ? await verifyAppleTransaction(token) : await googleSubscription(token);
      const r = await applyStoreState(state, { userId: user.id });
      if (r.applied && ["ACTIVE", "CANCELLED", "PAST_DUE"].includes(r.status)) restored++;
    } catch (e) {
      if (e instanceof ApiError && e.code === "store_other_account") otherAccount = true;
      else if (!(e instanceof ApiError)) throw e;
    }
  }
  const message = restored ? "Your subscription is restored." : otherAccount
    ? "That subscription belongs to a different Project Connect account. Sign in to that account to use it."
    : "We didn't find an active subscription for this store account.";
  return ok({ restored, message, subscription: await subscriptionSummary(user.id) });
});
