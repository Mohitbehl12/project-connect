import { exploreHome } from "@/lib/discover";
import { ok, route } from "@/lib/http";

/** Explore home: collections with real (rounded) sizes, your interests, and "Made For You". */
export const GET = route(async ({ user }) => ok(await exploreHome(user)));
