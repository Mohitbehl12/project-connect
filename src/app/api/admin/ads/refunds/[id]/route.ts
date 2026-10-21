import { z } from "zod";
import { decideRefund } from "@/lib/adsManage";
import { ok, parseBody, route } from "@/lib/http";

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, z.object({ approve: z.boolean(), note: z.string().trim().min(3).max(300) }));
  return ok(await decideRefund(user, params.id, b.approve, b.note));
}, { permission: "ads.finance" });
