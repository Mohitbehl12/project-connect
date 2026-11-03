import { ok, route } from "@/lib/http";
import { opsOverview } from "@/lib/opsAdmin";

export const GET = route(async () => ok(await opsOverview()), { permission: "ops.view" });
