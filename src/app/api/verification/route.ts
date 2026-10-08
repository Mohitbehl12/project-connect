import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, route } from "@/lib/http";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

/**
 * Selfie verification request. MOCK PROVIDER: this only queues the request for a moderator.
 * Production: capture a live selfie in the client, send it to a liveness/face-match vendor
 * (e.g. AWS Rekognition, Onfido, HyperVerge for India), and store only the vendor's result —
 * never the raw selfie or any ID document alongside the profile.
 */
export const POST = route(async ({ user }) => {
  if (user.selfieStatus === "VERIFIED") throw new ApiError(409, "You're already verified.", "already_verified");
  if (user.selfieStatus === "PENDING") throw new ApiError(409, "Your verification is already being reviewed.", "pending");
  await db.update(schema.users).set({ selfieStatus: "PENDING" }).where(eq(schema.users.id, user.id));
  await audit(user.id, "verification.requested", "user", user.id, { provider: "MOCK" });
  await notify(user.id, "VERIFICATION", "Verification submitted", "We'll review your selfie shortly. You'll get a badge once it's approved.", "/settings");
  return ok({ status: "PENDING", provider: "MOCK" });
});
