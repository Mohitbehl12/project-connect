import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { and, desc, gte } from "drizzle-orm";
import { hashPassword, needsRehash, verifyPassword } from "./auth";
import { open } from "./crypto";
import { notify } from "./notify";
import { addRiskSignal } from "./risk";
import { totpStep } from "./totp";
import { ApiError } from "./http";
import { rateLimit } from "./ratelimit";
import { audit } from "./audit";
import { can } from "./rbac";
import type { User } from "@/db/schema";

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

export type LoginContext = { ip: string; platform?: string; deviceName?: string; installId?: string; totp?: string };

async function record(userId: string | null, ok: boolean, reason: string, ctx: LoginContext) {
  await db.insert(schema.loginEvents).values({ userId, success: ok, reason, ip: ctx.ip, platform: ctx.platform ?? "web", deviceName: ctx.deviceName?.slice(0, 80), installId: ctx.installId?.slice(0, 64) });
}

/**
 * Shared sign-in for web (cookie) and app (token): rate limits, lockout, ban check, optional 2-step code,
 * sign-in history, new-device alert, and an Argon2id upgrade for older password hashes.
 */
export async function authenticate(email: string, password: string, ipOrCtx: string | LoginContext): Promise<User> {
  const ctx: LoginContext = typeof ipOrCtx === "string" ? { ip: ipOrCtx } : ipOrCtx;
  const ip = ctx.ip;
  rateLimit(`login:${ip}`, 30, 15 * 60_000);
  rateLimit(`login:${email}`, 10, 15 * 60_000);

  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  const generic = new ApiError(401, "That email and password don't match.", "bad_credentials");
  if (!user) {
    await verifyPassword(password, "$2a$12$abcdefghijklmnopqrstuuJ1v1Q0eGJ0Yy0aZ3YkI3pV8s5Vb1D9e"); // equalise timing
    throw generic;
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await record(user.id, false, "locked", ctx);
    throw new ApiError(423, `Too many failed attempts. Try again after ${LOCK_MINUTES} minutes.`, "locked");
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await db.update(schema.users).set({
      failedLogins: failed >= LOCK_AFTER ? 0 : failed,
      lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
    }).where(eq(schema.users.id, user.id));
    if (failed >= LOCK_AFTER) await audit(user.id, "auth.locked", "user", user.id);
    await record(user.id, false, "bad_password", ctx);
    throw generic;
  }
  if (user.status === "DELETED") throw new ApiError(401, "That email or password isn't right.", "bad_credentials");
  if (user.status === "BANNED") {
    await record(user.id, false, "banned", ctx);
    throw new ApiError(403, "This account has been banned for breaking our community guidelines.", "banned");
  }
  if (user.totpSecret) {
    if (!ctx.totp) {
      await record(user.id, false, "totp_required", ctx);
      throw new ApiError(401, "Enter the 6-digit code from your authenticator app.", "totp_required");
    }
    rateLimit(`totp:${user.id}`, 8, 15 * 60_000);
    const step = totpStep(open(user.totpSecret), ctx.totp);
    if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) {
      await record(user.id, false, "bad_totp", ctx);
      throw new ApiError(401, step === null ? "That code didn't work. Check your authenticator app and try again." : "That code was already used. Wait for the next one.", "bad_totp");
    }
    await db.update(schema.users).set({ totpLastStep: step }).where(eq(schema.users.id, user.id));
  }

  await db.update(schema.users).set({ failedLogins: 0, lockedUntil: null, lastActiveAt: new Date() }).where(eq(schema.users.id, user.id));
  if (needsRehash(user.passwordHash)) await db.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, user.id));
  await newDeviceCheck(user, ctx);
  await record(user.id, true, "ok", ctx);
  return user;
}

export function nextRoute(user: User) {
  return can(user.role, "admin.access") ? "/admin" : user.onboardingStep < 3 ? "/onboarding" : "/discover";
}

/** Tells the person about a sign-in from a device we haven't seen; flags it if it followed failed attempts. */
async function newDeviceCheck(user: User, ctx: LoginContext) {
  if (!ctx.installId && !ctx.platform) return;
  const past = await db.select().from(schema.loginEvents).where(and(eq(schema.loginEvents.userId, user.id), eq(schema.loginEvents.success, true))).orderBy(desc(schema.loginEvents.createdAt)).limit(200);
  if (!past.length) return; // first ever sign-in
  const known = ctx.installId ? past.some((e) => e.installId === ctx.installId) : past.some((e) => e.platform === (ctx.platform ?? "web") && e.ip === ctx.ip);
  if (known) return;
  const what = ctx.deviceName ? `${ctx.deviceName}` : ctx.platform === "ios" ? "an iPhone" : ctx.platform === "android" ? "an Android phone" : "a web browser";
  await notify(user.id, "SECURITY", "New sign-in to your account", `Signed in on ${what}. If this wasn't you, open Settings › Security and sign out of all devices, then change your password.`, "/security");
  const recentFails = await db.select({ id: schema.loginEvents.id }).from(schema.loginEvents)
    .where(and(eq(schema.loginEvents.userId, user.id), eq(schema.loginEvents.success, false), gte(schema.loginEvents.createdAt, new Date(Date.now() - 3600_000))));
  if (recentFails.length >= 3) await addRiskSignal(user.id, "NEW_DEVICE_LOGIN", 10, `${recentFails.length} failed attempts before a new-device sign-in`);
}
