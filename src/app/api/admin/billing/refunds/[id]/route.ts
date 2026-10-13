import { z } from "zod";
import { decideRefund } from "@/lib/billing";
import { ok, parseBody, route } from "@/lib/http";

const Body = z.object({ approve: z.boolean(), note: z.string().trim().max(500).default("") });

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, Body);
  return ok(await decideRefund(user, params.id, b.approve, b.note));
}, { permission: "payments.refund_approve" });
