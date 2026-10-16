import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { removeSubscription, saveSubscription, webPushEnabled, webPushPublicKey } from "@/lib/webpush";

/** The public key the browser needs to subscribe. */
export const GET = route(async () => ok({ enabled: webPushEnabled(), publicKey: webPushEnabled() ? await webPushPublicKey() : null }), { allowSuspended: true });

const Sub = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "endpoint: must be https"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Turns notifications on for this browser. */
export const POST = route(async ({ req, user }) => {
  await rateLimit(`webpush:${user.id}`, 20, 60 * 60_000);
  await saveSubscription(user.id, await parseBody(req, Sub));
  return ok({ subscribed: true }, 201);
});

/** Turns them off for this browser. */
export const DELETE = route(async ({ req, user }) => {
  const { endpoint } = await parseBody(req, z.object({ endpoint: z.string().max(1000) }));
  await removeSubscription(user.id, endpoint);
  return ok({ subscribed: false });
}, { allowSuspended: true });
