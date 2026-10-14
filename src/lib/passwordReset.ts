import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { hashPassword, passwordOk, PASSWORD_RULES, revokeAllSessions } from "./auth";
import { emailConfigured, sendEmail, simpleEmail } from "./email";
import { ApiError } from "./http";
import { notify } from "./notify";
import { appUrl } from "./paytoken";

const TTL_MIN = 30;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * Starts a reset. Always behaves the same whether or not the email has an account, so the form
 * can't be used to find out who is registered. Returns a dev link only when DEV_SHOW_OTP=true.
 */
export async function startPasswordReset(email: string, ip: string): Promise<{ devResetUrl?: string }> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user || user.status === "DELETED" || user.status === "BANNED") return {};
  const token = randomBytes(32).toString("base64url");
  // Only the newest link works.
  await db.update(schema.passwordResets).set({ usedAt: new Date() }).where(and(eq(schema.passwordResets.userId, user.id), isNull(schema.passwordResets.usedAt)));
  await db.insert(schema.passwordResets).values({ userId: user.id, tokenHash: sha(token), expiresAt: new Date(Date.now() + TTL_MIN * 60_000), ip });
  const url = `${appUrl()}/reset-password?token=${token}`;
  const mail = simpleEmail("Reset your password", [
    "Someone (hopefully you) asked to reset the password for your Project Connect account.",
    `This link works once and expires in ${TTL_MIN} minutes. If you didn't ask for it, ignore this email — your password stays the same.`,
  ], { label: "Choose a new password", url });
  await sendEmail(user.email, "Reset your Project Connect password", mail.text, mail.html);
  await audit(user.id, "auth.reset_requested", "user", user.id, { emailSent: emailConfigured() });
  return process.env.DEV_SHOW_OTP === "true" ? { devResetUrl: url } : {};
}

export async function checkResetToken(token: string) {
  const row = await db.query.passwordResets.findFirst({ where: and(eq(schema.passwordResets.tokenHash, sha(token)), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date())) });
  return row ?? null;
}

export async function completePasswordReset(token: string, password: string) {
  if (!passwordOk(password)) throw new ApiError(422, PASSWORD_RULES, "weak_password");
  const row = await checkResetToken(token);
  if (!row) throw new ApiError(400, "This reset link has expired or was already used. Ask for a new one.", "reset_invalid");
  // Claim the link atomically so it can only be used once.
  const claimed = await db.update(schema.passwordResets).set({ usedAt: new Date() })
    .where(and(eq(schema.passwordResets.id, row.id), isNull(schema.passwordResets.usedAt))).returning({ id: schema.passwordResets.id });
  if (!claimed.length) throw new ApiError(400, "This reset link was already used. Ask for a new one.", "reset_invalid");
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) });
  if (!user || user.status === "DELETED" || user.status === "BANNED") throw new ApiError(400, "This account can't be reset.", "reset_invalid");
  await db.update(schema.users).set({ passwordHash: await hashPassword(password), tokenVersion: user.tokenVersion + 1, failedLogins: 0, lockedUntil: null })
    .where(eq(schema.users.id, user.id));
  await revokeAllSessions(user.id);
  await audit(user.id, "auth.password_reset", "user", user.id);
  await notify(user.id, "SECURITY", "Your password was reset", "All devices were signed out. If this wasn't you, contact support right away.", "/security");
  return { email: user.email };
}
