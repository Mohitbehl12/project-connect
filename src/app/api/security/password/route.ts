import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword, passwordOk, PASSWORD_RULES, revokeAllSessions, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({ current: z.string().min(1).max(128), next: z.string().min(1).max(128) });

/** Change password; signs out every device (including this one) so a stolen session can't linger. */
export const POST = route(async ({ req, user }) => {
  rateLimit(`pwchange:${user.id}`, 5, 15 * 60_000);
  const b = await parseBody(req, Body);
  if (!(await verifyPassword(b.current, user.passwordHash))) throw new ApiError(401, "Your current password isn't right.", "bad_credentials");
  if (!passwordOk(b.next)) throw new ApiError(422, PASSWORD_RULES, "weak_password");
  await db.update(schema.users).set({ passwordHash: await hashPassword(b.next), tokenVersion: user.tokenVersion + 1 }).where(eq(schema.users.id, user.id));
  await revokeAllSessions(user.id);
  await audit(user.id, "security.password_change", "user", user.id);
  await notify(user.id, "SECURITY", "Your password was changed", "All devices were signed out. If this wasn't you, contact support right away.", "/security");
  return ok({ changed: true, signedOut: true });
});
