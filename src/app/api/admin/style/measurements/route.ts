import { audit } from "@/lib/audit";
import { ok, route } from "@/lib/http";
import { adminMeasurementProfiles } from "@/lib/style/server";
/** Body measurements are personal: only the workshop and admins, and every view is logged. */
export const GET = route(async ({ user }) => { await audit(user.id, "style.view_measurements", "style_profiles", "list"); return ok({ profiles: await adminMeasurementProfiles() }); }, { permission: "style.measurements" });
