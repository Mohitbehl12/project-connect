import { requireAdvertiser } from "@/lib/ads";
import { submitCampaign } from "@/lib/adsManage";
import { ok, route } from "@/lib/http";

export const POST = route<{ id: string }>(async ({ user, params }) => ok(await submitCampaign(await requireAdvertiser(user), params.id)), { allowOnboarding: true });
