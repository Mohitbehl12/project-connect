import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { campaignStats, requireAdvertiser } from "@/lib/ads";
import { CampaignInput, campaignView, ownCampaign, updateCampaign } from "@/lib/adsManage";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { storage } from "@/lib/storage";

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const adv = await requireAdvertiser(user);
  const c = await ownCampaign(adv.id, params.id);
  const v = campaignView(c);
  const keys = [...v.creative.imageKeys, v.creative.logoKey, v.creative.videoKey].filter((k): k is string => !!k);
  const media = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await storage().url(k, 3600)] as const)));
  return ok({ campaign: v, media, stats: await campaignStats([c.id], 60) });
}, { allowOnboarding: true });

export const PUT = route<{ id: string }>(async ({ req, user, params }) => {
  const adv = await requireAdvertiser(user);
  const r = await updateCampaign(adv.id, params.id, await parseBody(req, CampaignInput));
  return ok({ campaign: campaignView(r.campaign), backToDraft: r.backToDraft });
}, { allowOnboarding: true });

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const adv = await requireAdvertiser(user);
  const c = await ownCampaign(adv.id, params.id);
  if (c.status !== "DRAFT" && c.status !== "REJECTED") throw new ApiError(409, "Only drafts can be deleted. Pause a running campaign instead.", "bad_state");
  await db.delete(schema.adCampaigns).where(eq(schema.adCampaigns.id, c.id));
  return ok({ deleted: true });
}, { allowOnboarding: true });
