import { z } from "zod";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { resolveHeldReferral } from "@/lib/referrals";

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, z.object({ approve: z.boolean() }));
  const status = await resolveHeldReferral(user.id, params.id, b.approve);
  if (!status) throw new ApiError(404, "This referral isn't waiting for review.", "not_held");
  return ok({ status });
}, { permission: "referrals.manage" });
