import { catalogue } from "@/lib/billing";
import { ok, route } from "@/lib/http";

/** Plans with personalised quotes (offer, today's price, renewal price and date), passes, and current status. */
export const GET = route(async ({ user }) => ok(await catalogue(user)), { allowOnboarding: true });
