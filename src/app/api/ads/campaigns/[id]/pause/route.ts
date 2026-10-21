import { z } from "zod";
import { requireAdvertiser } from "@/lib/ads";
import { setPaused } from "@/lib/adsManage";
import { ok, parseBody, route } from "@/lib/http";

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const { paused } = await parseBody(req, z.object({ paused: z.boolean() }));
  return ok(await setPaused((await requireAdvertiser(user)).id, params.id, paused));
}, { allowOnboarding: true });
