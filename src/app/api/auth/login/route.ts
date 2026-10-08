import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { ApiError, clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";

const Body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

export const POST = publicRoute(async ({ req }) => {
  const ip = await clientIp();
  const body = await parseBody(req, Body);
  rateLimit(`login:${ip}`, 30, 15 * 60_000);
  rateLimit(`login:${body.email}`, 10, 15 * 60_000);

  const user = await db.query.users.findFirst({ where: eq(schema.users.email, body.email) });
  const generic = new ApiError(401, "That email and password don't match.", "bad_credentials");
  if (!user) {
    await verifyPassword(body.password, "$2a$12$abcdefghijklmnopqrstuuJ1v1Q0eGJ0Yy0aZ3YkI3pV8s5Vb1D9e"); // equalise timing
    throw generic;
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now())
    throw new ApiError(423, `Too many failed attempts. Try again after ${LOCK_MINUTES} minutes or reset your password.`, "locked");

  if (!(await verifyPassword(body.password, user.passwordHash))) {
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
  await createSession(user);
  await audit(user.id, "auth.login", "user", user.id);

  const next = can(user.role, "admin.access") ? "/admin" : user.onboardingStep < 3 ? "/onboarding" : "/discover";
  return ok({ next });
});
