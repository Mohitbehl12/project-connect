import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { open, seal } from "@/lib/crypto";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/ratelimit";
import { newTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";

/** Optional 2-step verification with an authenticator app. Secrets are stored encrypted. */
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("confirm"), code: z.string().min(6).max(10) }),
  z.object({ action: z.literal("disable"), password: z.string().min(1), code: z.string().min(6).max(10) }),
]);

export const GET = route(async ({ user }) => ok({ enabled: !!user.totpSecret }));

export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  await rateLimit(`totp-setup:${user.id}`, 10, 15 * 60_000);
  if (b.action === "start") {
    if (user.totpSecret) throw new ApiError(409, "2-step verification is already on.", "already_on");
    const secret = newTotpSecret();
    await db.update(schema.users).set({ totpPending: seal(secret, user.id) }).where(eq(schema.users.id, user.id));
    return ok({ secret, otpauthUrl: otpauthUrl(secret, user.email) });
  }
  if (b.action === "confirm") {
    if (!user.totpPending || !verifyTotp(open(user.totpPending, user.id), b.code)) throw new ApiError(422, "That code didn't match. Make sure your phone's clock is right and try again.", "bad_totp");
    await db.update(schema.users).set({ totpSecret: seal(open(user.totpPending, user.id)), totpPending: null }).where(eq(schema.users.id, user.id));
    await audit(user.id, "security.totp_on", "user", user.id);
    await notify(user.id, "SECURITY", "2-step verification is on", "You'll be asked for a code from your authenticator app when you sign in.", "/security");
    return ok({ enabled: true });
  }
  if (!user.totpSecret) throw new ApiError(409, "2-step verification is already off.", "already_off");
  if (!(await verifyPassword(b.password, user.passwordHash)) || !verifyTotp(open(user.totpSecret), b.code)) throw new ApiError(401, "Your password or code isn't right.", "bad_credentials");
  await db.update(schema.users).set({ totpSecret: null }).where(eq(schema.users.id, user.id));
  await audit(user.id, "security.totp_off", "user", user.id);
  await notify(user.id, "SECURITY", "2-step verification is off", "If you didn't do this, change your password now.", "/security");
  return ok({ enabled: false });
});
