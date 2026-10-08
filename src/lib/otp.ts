import "server-only";
import { randomInt, createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError } from "./http";

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/**
 * Issues a 6-digit OTP. DELIVERY IS MOCKED: wire an SMS (MSG91/Twilio) or email (SES/Resend)
 * provider into deliver(). With DEV_SHOW_OTP=true the code is returned to the client for testing.
 */
export async function issueOtp(userId: string, channel: "EMAIL" | "PHONE", destination: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(schema.otpCodes).values({
    userId, channel, codeHash: hash(code), expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  await deliver(channel, destination, code);
  return process.env.DEV_SHOW_OTP === "true" ? code : undefined;
}

async function deliver(channel: string, destination: string, code: string) {
  if (process.env.NODE_ENV !== "production") console.log(`[otp:mock] ${channel} → ${destination}: ${code}`);
  // TODO(provider): send via SMS/email provider.
}

export async function verifyOtp(userId: string, channel: "EMAIL" | "PHONE", code: string) {
  const otp = await db.query.otpCodes.findFirst({
    where: and(eq(schema.otpCodes.userId, userId), eq(schema.otpCodes.channel, channel), isNull(schema.otpCodes.usedAt)),
    orderBy: desc(schema.otpCodes.createdAt),
  });
  if (!otp || otp.expiresAt.getTime() < Date.now()) throw new ApiError(400, "That code has expired. Request a new one.", "otp_expired");
  if (otp.attempts >= 5) throw new ApiError(429, "Too many wrong codes. Request a new one.", "otp_locked");
  if (otp.codeHash !== hash(code)) {
    await db.update(schema.otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(schema.otpCodes.id, otp.id));
    throw new ApiError(400, "That code doesn't match. Check it and try again.", "otp_wrong");
  }
  await db.update(schema.otpCodes).set({ usedAt: new Date() }).where(eq(schema.otpCodes.id, otp.id));
}
