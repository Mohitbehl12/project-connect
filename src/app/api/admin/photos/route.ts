import { ok, route } from "@/lib/http";
import { pendingPhotos } from "@/lib/photoReview";

export const GET = route(async () => ok({ photos: await pendingPhotos() }), { permission: "users.moderate" });
