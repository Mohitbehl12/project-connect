import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { reviewPhoto } from "@/lib/photoReview";

const Body = z.object({ approve: z.boolean() });
export const POST = route<{ id: string }>(async ({ req, user, params }) => ok(await reviewPhoto(user.id, params.id, (await parseBody(req, Body)).approve)), { permission: "users.moderate" });
