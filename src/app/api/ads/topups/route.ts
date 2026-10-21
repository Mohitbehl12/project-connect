import { z } from "zod";
import { requireAdvertiser } from "@/lib/ads";
import { startTopup } from "@/lib/adsManage";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const POST = route(async ({ req, user }) => {
  await rateLimit(`ad-topup:${user.id}`, 20, 60 * 60_000);
  const { amountMinor } = await parseBody(req, z.object({ amountMinor: z.number().int().min(1) }));
  return ok(await startTopup(await requireAdvertiser(user), amountMinor), 201);
}, { allowOnboarding: true });
