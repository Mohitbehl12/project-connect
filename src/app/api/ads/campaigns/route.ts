import { requireAdvertiser } from "@/lib/ads";
import { CampaignInput, campaignView, createCampaign } from "@/lib/adsManage";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const POST = route(async ({ req, user }) => {
  const adv = await requireAdvertiser(user);
  await rateLimit(`ad-create:${user.id}`, 30, 60 * 60_000);
  const c = await createCampaign(adv.id, await parseBody(req, CampaignInput));
  return ok({ campaign: campaignView(c) }, 201);
}, { allowOnboarding: true });
