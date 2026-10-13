import { ok, route } from "@/lib/http";
import { referralOverview } from "@/lib/referrals";

/** My invite code, share link, reward rules and history. */
export const GET = route(async ({ user }) => ok(await referralOverview(user)));
