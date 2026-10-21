import { ok, publicRoute } from "@/lib/http";
import { retentionSchedule } from "@/lib/privacy";

/** How long we keep each kind of data. Public, so the Privacy Policy and the app show the same live numbers. */
export const GET = publicRoute(async () => ok({ schedule: await retentionSchedule() }));
