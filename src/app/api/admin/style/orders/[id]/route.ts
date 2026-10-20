import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { adminSetStatus } from "@/lib/style/server";

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, z.object({ status: z.number().int(), note: z.string().max(300).default("") }));
  return ok({ order: await adminSetStatus(user, params.id, b.status, b.note) });
}, { permission: "style.manage" });
