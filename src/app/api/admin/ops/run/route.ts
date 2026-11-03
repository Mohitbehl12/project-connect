import { audit } from "@/lib/audit";
import { ApiError, ok, route } from "@/lib/http";
import { runMonitor } from "@/lib/monitor";
import { can } from "@/lib/rbac";

/** "Check now" — runs the monitor immediately (same work as the 5-minute schedule). */
export const POST = route(async ({ user }) => {
  if (!can(user.role, "ops.manage")) throw new ApiError(403, "You don't have permission to run checks.", "forbidden");
  const r = await runMonitor();
  await audit(user.id, "ops.monitor.run", "ops", null, {});
  return ok({ ran: true, anomalies: r.anomalies, alerts: r.alerts });
}, { permission: "ops.view" });
