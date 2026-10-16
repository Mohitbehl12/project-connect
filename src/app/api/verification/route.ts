import { ok, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { startVerification, verificationStatus } from "@/lib/verification";

/** Where the person's verification stands, and the pose to do if one is open. */
export const GET = route(async ({ user }) => ok(await verificationStatus(user)));

/** Starts verification: returns a random pose to do in the selfie (valid 15 minutes). */
export const POST = route(async ({ user }) => {
  rateLimit(`verify-start:${user.id}`, 10, 60 * 60_000);
  return ok(await startVerification(user));
});
