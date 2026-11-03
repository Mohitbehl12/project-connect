import { z } from "zod";
import { audit } from "@/lib/audit";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { rollback } from "@/lib/monitor";
import { RELEASE, opsAction } from "@/lib/ops";
import { can } from "@/lib/rbac";

/** Manual rollback to the previous healthy release (Render). */
export const POST = route(async ({ req, user }) => {
  if (!can(user.role, "ops.manage")) throw new ApiError(403, "You don't have permission to roll back.", "forbidden");
  const b = await parseBody(req, z.object({ confirm: z.literal("ROLL BACK"), reason: z.string().trim().min(5).max(300) }));
  const r = await rollback(`manual: ${b.reason}`);
  await opsAction("ADMIN", r.ok ? "manual_rollback" : "manual_rollback_failed", { result: r.ok ? "OK" : "FAILED", risk: 80, detail: { by: user.id, from: RELEASE, reason: b.reason, ...r } });
  await audit(user.id, "ops.rollback", "release", RELEASE, { ok: r.ok, to: r.to, reason: b.reason });
  if (!r.ok) throw new ApiError(502, `Rollback didn't start: ${r.error}`, "rollback_failed");
  return ok({ started: true, to: r.to });
}, { permission: "ops.view" });
