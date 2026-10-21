import { boostStatus, startBoost } from "@/lib/boosts";
import { ok, route } from "@/lib/http";
import { assertCanStartContact } from "@/lib/safety";

export const GET = route(async ({ user }) => ok(await boostStatus(user)));
export const POST = route(async ({ user }) => { assertCanStartContact(user); return ok(await startBoost(user), 201); });
