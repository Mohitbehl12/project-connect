import { CheckinBody, createCheckin, listCheckins } from "@/lib/checkins";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

/** Date check-ins: your own only. Safety is never a paid feature. */
export const GET = route(async ({ user }) => ok({ checkins: await listCheckins(user.id) }), { allowSuspended: true });

export const POST = route(async ({ req, user }) => {
  await rateLimit(`checkin:${user.id}`, 10, 86400_000);
  const r = await createCheckin(user.id, await parseBody(req, CheckinBody));
  return ok(r, 201);
}, { allowSuspended: true });
