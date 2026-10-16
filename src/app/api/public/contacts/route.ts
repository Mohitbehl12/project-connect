import { getConfig } from "@/lib/config";
import { ok, publicRoute } from "@/lib/http";

/** Published support and Grievance Officer contacts (public information). */
export const GET = publicRoute(async () => ok({ contacts: await getConfig("legal.contacts") }));
