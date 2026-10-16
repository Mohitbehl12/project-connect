import { z } from "zod";
import { startCheckout } from "@/lib/billing";
import { ok, parseBody, route } from "@/lib/http";
import { appUrl, signScoped } from "@/lib/paytoken";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  planCode: z.string().min(1).max(30),
  offerId: z.string().max(60).optional().nullable(),
  coupon: z.string().max(40).optional().nullable(),
  durationDays: z.number().int().min(1).max(366).optional().nullable(), // billing period picked (default monthly)
  acceptTerms: z.literal(true, { message: "Please confirm you understand the subscription terms." }),
  expectedTodayMinor: z.number().int().nonnegative(), // the amount the person saw; must still be right
  returnTo: z.enum(["app", "web"]).default("web"),
});

export const POST = route(async ({ req, user }) => {
  await rateLimit(`checkout:${user.id}`, 10, 15 * 60_000);
  const b = await parseBody(req, Body);
  const r = await startCheckout(user, b);
  const t = await signScoped("pay", user.id, r.paymentId);
  return ok({ ...r, payUrl: `${appUrl()}/pay/${r.paymentId}?t=${encodeURIComponent(t)}&return=${b.returnTo}` }, 201);
});
