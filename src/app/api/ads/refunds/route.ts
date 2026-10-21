import { z } from "zod";
import { requireAdvertiser } from "@/lib/ads";
import { requestRefund } from "@/lib/adsManage";
import { ok, parseBody, route } from "@/lib/http";

export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, z.object({ amountMinor: z.number().int().min(1), reason: z.string().trim().min(5).max(500) }));
  const t = await requestRefund(await requireAdvertiser(user), b.amountMinor, b.reason);
  return ok({ id: t.id, status: t.status, message: "Refund requested. Our finance team reviews it within 7 working days." }, 201);
}, { allowOnboarding: true });
