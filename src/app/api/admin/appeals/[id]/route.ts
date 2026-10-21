import { z } from "zod";
import { decideAppeal } from "@/lib/appeals";
import { ok, parseBody, route } from "@/lib/http";

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, z.object({ outcome: z.enum(["UPHELD", "OVERTURNED"]), decision: z.string().trim().min(10, "Explain the decision in a sentence or two.").max(1000) }));
  return ok(await decideAppeal(user.id, params.id, b.outcome, b.decision));
}, { permission: "reports.resolve" });
