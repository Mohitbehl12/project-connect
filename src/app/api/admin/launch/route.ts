import { z } from "zod";
import { audit } from "@/lib/audit";
import { getConfig, setConfig } from "@/lib/config";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { SIGNOFF_ITEMS, autoChecks } from "@/lib/launch";
import { can } from "@/lib/rbac";

export const GET = route(async () => {
  const done = await getConfig("launch.checklist");
  const checks = await autoChecks();
  const items = SIGNOFF_ITEMS.map((i) => ({ ...i, ...(done[i.id] ?? { status: "OPEN", by: "", at: "", note: "" }) }));
  return ok({ checks, items, ready: checks.every((c) => c.ok) && items.every((i) => i.status !== "OPEN") });
}, { permission: "audit.view" });

export const PUT = route(async ({ req, user }) => {
  if (!can(user.role, "config.edit")) throw new ApiError(403, "You don't have permission to sign off launch items.", "forbidden");
  const b = await parseBody(req, z.object({
    id: z.string().max(20), status: z.enum(["OPEN", "DONE", "NOT_APPLICABLE"]),
    by: z.string().trim().max(200), note: z.string().trim().max(1000).default(""),
  }));
  if (!SIGNOFF_ITEMS.some((i) => i.id === b.id)) throw new ApiError(404, "Unknown item.", "not_found");
  if (b.status !== "OPEN" && b.by.length < 3) throw new ApiError(422, "by: Say who did the review or test (person or firm).", "validation");
  const cur = await getConfig("launch.checklist");
  await setConfig("launch.checklist", { ...cur, [b.id]: { status: b.status, by: b.by, at: new Date().toISOString(), note: b.note } }, user.id);
  await audit(user.id, "launch.signoff", "config", b.id, { status: b.status, by: b.by });
  return ok({ saved: true });
}, { permission: "audit.view" });
