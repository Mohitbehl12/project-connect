import { ok, route } from "@/lib/http";
import { can } from "@/lib/rbac";
import { adminOrders } from "@/lib/style/server";

/** Workshop orders. Measurements and the delivery address only for staff who make or ship the clothes. */
export const GET = route(async ({ req, user }) => {
  const f = new URL(req.url).searchParams.get("filter");
  return ok({ orders: await adminOrders(f === "all" || f === "late" ? f : "open", can(user.role, "style.measurements")) });
}, { permission: "style.view" });
