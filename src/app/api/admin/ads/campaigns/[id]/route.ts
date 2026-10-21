import { z } from "zod";
import { reviewCampaign } from "@/lib/adsManage";
import { ok, parseBody, route } from "@/lib/http";

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, z.object({ action: z.enum(["approve", "reject", "pause", "resume", "delete"]), note: z.string().trim().max(500).optional(), publicReason: z.string().trim().max(300).optional(), verifyAdvertiser: z.boolean().optional() }));
  return ok(await reviewCampaign(user, params.id, b));
}, { permission: "ads.review" });
