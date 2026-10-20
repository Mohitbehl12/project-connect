import { ok, route } from "@/lib/http";
import { adminCustomers } from "@/lib/style/server";
export const GET = route(async () => ok({ customers: await adminCustomers() }), { permission: "style.view" });
