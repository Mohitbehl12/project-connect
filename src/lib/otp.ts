import "server-only";
import { randomInt, createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { emailConfigured, sendEmail, simpleEmail } from "./email";
import { ApiError } from "./http";

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/**
 * Issues a 6-digit OTP and sends it: email through Resend (RESEND_API_KEY + EMAIL_FROM), SMS through MSG91
 * (MSG91_AUTH_KEY + MSG91_OTP_TEMPLATE_ID, a DLT-approved template). Without a provider nothing is sent
 * (development logs the code). With DEV_SHOW_OTP=true the code is returned to the client for testing.
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
  if (process.env.NODE_ENV !== "production") console.log(`[otp:dev] ${channel} → ${destination}: ${code}`);
  try {
    if (channel === "EMAIL") return await sendEmailOtp(destination, code);
    return await sendSmsOtp(destination, code);
  } catch (e) {
    // Never reveal provider errors to the person; they can ask for a new code.
    console.error(`[otp] ${channel} delivery failed:`, (e as Error).message);
    return false;
  }
}

async function sendEmailOtp(to: string, code: string) {
  if (!emailConfigured()) { if (process.env.NODE_ENV === "production") console.warn("[otp] email not configured; code not sent"); return false; }
  const m = simpleEmail(`Your Project Connect code: ${code}`, [`Use ${code} to confirm your email. It expires in 10 minutes.`, "If you didn't ask for this, you can ignore this email. Never share this code with anyone."]);
  return sendEmail(to, `${code} is your Project Connect code`, m.text, m.html);
}

/** MSG91 OTP API (India). The template must be DLT-registered and contain the OTP variable. Untested against a live account. */
async function sendSmsOtp(phone: string, code: string) {
  const key = process.env.MSG91_AUTH_KEY, template = process.env.MSG91_OTP_TEMPLATE_ID;
  if (!key || !template) { if (process.env.NODE_ENV === "production") console.warn("[otp] SMS not configured; code not sent"); return false; }
  const mobile = phone.replace(/[^\d]/g, "");
  const url = `https://control.msg91.com/api/v5/otp?${new URLSearchParams({ template_id: template, mobile, otp: code, otp_expiry: "10", otp_length: "6", realTimeResponse: "1" })}`;
  const res = await fetch(url, { method: "POST", headers: { authkey: key, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ OTP: code }), signal: AbortSignal.timeout(10_000) });
  const j = await res.json().catch(() => ({})) as { type?: string; message?: string; code?: string };
  // MSG91 can answer 200 with an error inside, so check the body too.
  if (!res.ok || j.type !== "success") throw new Error(`MSG91: ${j.message ?? res.status}`);
  return true;
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
