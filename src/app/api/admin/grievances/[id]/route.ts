import { z } from "zod";
import { updateGrievance } from "@/lib/grievances";
import { ok, parseBody, route } from "@/lib/http";

const Body = z.object({ action: z.enum(["progress", "resolve", "reject"]), reply: z.string().max(4000).optional() });

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, Body);
  return ok(await updateGrievance(user.id, params.id, b.action, b.reply));
}, { permission: "grievances.handle" });
