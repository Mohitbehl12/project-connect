import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { open } from "@/lib/crypto";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { staffMfaRequired, staffState } from "@/lib/staff";
import { totpStep } from "@/lib/totp";

/** Staff: is the admin area unlocked, and is 2-step on? */
export const GET = route(async ({ user }) => {
  if (user.role === "USER") throw new ApiError(403, "Staff only.", "forbidden");
  return ok(await staffState(user));
});

/** Unlock the admin area with a fresh 2-step code (or the password, only when 2-step is optional for local tests). */
export const POST = route(async ({ req, user }) => {
  if (user.role === "USER") throw new ApiError(403, "Staff only.", "forbidden");
  await rateLimit(`staff-unlock:${user.id}`, 8, 15 * 60_000);
  const b = await parseBody(req, z.object({ code: z.string().min(6).max(10).optional(), password: z.string().min(1).max(128).optional() }));
  if (user.totpSecret) {
    const step = b.code ? totpStep(open(user.totpSecret), b.code) : null;
    if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) {
      await audit(user.id, "staff.unlock_failed", "user", user.id);
      throw new ApiError(401, step === null ? "That code didn't work." : "That code was already used. Wait for the next one.", "bad_totp");
    }
    await db.update(schema.users).set({ totpLastStep: step, staffUnlockedAt: new Date() }).where(eq(schema.users.id, user.id));
  } else {
    if (staffMfaRequired()) throw new ApiError(403, "Turn on 2-step verification first.", "staff_mfa_required");
    if (!b.password || !(await verifyPassword(b.password, user.passwordHash))) throw new ApiError(401, "That password isn't right.", "bad_credentials");
    await db.update(schema.users).set({ staffUnlockedAt: new Date() }).where(eq(schema.users.id, user.id));
  }
  await audit(user.id, "staff.unlock", "user", user.id);
  return ok({ unlocked: true });
});
