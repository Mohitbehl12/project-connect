import { pickHomeAd } from "@/lib/ads";
import { ok, publicRoute } from "@/lib/http";

export const GET = publicRoute(async () => ok({ ad: await pickHomeAd() }));
