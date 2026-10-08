import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyPassword } from "./auth";
import { ApiError } from "./http";
import { rateLimit } from "./ratelimit";
import { audit } from "./audit";
import { can } from "./rbac";
import type { User } from "@/db/schema";

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

/** Shared password check for web (cookie) and app (token) sign-in: rate limits, lockout, ban check. */
export async function authenticate(email: string, password: string, ip: string): Promise<User> {
  rateLimit(`login:${ip}`, 30, 15 * 60_000);
  rateLimit(`login:${email}`, 10, 15 * 60_000);

  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  const generic = new ApiError(401, "That email and password don't match.", "bad_credentials");
  if (!user) {
    await verifyPassword(password, "$2a$12$abcdefghijklmnopqrstuuJ1v1Q0eGJ0Yy0aZ3YkI3pV8s5Vb1D9e"); // equalise timing
    throw generic;
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now())
    throw new ApiError(423, `Too many failed attempts. Try again after ${LOCK_MINUTES} minutes.`, "locked");

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await db.update(schema.users).set({
      failedLogins: failed >= LOCK_AFTER ? 0 : failed,
      lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
    }).where(eq(schema.users.id, user.id));
    if (failed >= LOCK_AFTER) await audit(user.id, "auth.locked", "user", user.id);
    throw generic;
  }
  if (user.status === "BANNED") throw new ApiError(403, "This account has been banned for breaking our community guidelines.", "banned");

  await db.update(schema.users).set({ failedLogins: 0, lockedUntil: null, lastActiveAt: new Date() }).where(eq(schema.users.id, user.id));
  return user;
}

export function nextRoute(user: User) {
  return can(user.role, "admin.access") ? "/admin" : user.onboardingStep < 3 ? "/onboarding" : "/discover";
}
