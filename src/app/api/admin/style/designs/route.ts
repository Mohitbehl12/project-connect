import { ok, route } from "@/lib/http";
import { adminDesigns } from "@/lib/style/server";
export const GET = route(async () => ok({ designs: await adminDesigns() }), { permission: "style.view" });
