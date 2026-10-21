import { z } from "zod";
import { requireAdvertiser } from "@/lib/ads";
import { confirmTopup } from "@/lib/adsManage";
import { ok, parseBody, route } from "@/lib/http";

/** The browser's Razorpay result (signature-checked), or the test-mode confirmation. The webhook also credits. */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, z.object({ paymentId: z.string().max(100).optional(), signature: z.string().max(200).optional(), test: z.boolean().optional() }));
  const t = await confirmTopup(await requireAdvertiser(user), params.id, b);
  return ok({ status: t?.status, receiptNo: t?.receiptNo });
}, { allowOnboarding: true });
