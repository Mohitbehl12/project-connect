import { ok, route } from "@/lib/http";
import { adminReports } from "@/lib/style/server";
export const GET = route(async () => ok(await adminReports()), { permission: "style.view" });
