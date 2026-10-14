import { z } from "zod";
import { clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { checkResetToken, completePasswordReset } from "@/lib/passwordReset";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(128) });

/** GET ?token=… checks a link is still valid; POST sets the new password and signs out every device. */
export const GET = publicRoute(async ({ req }) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return ok({ valid: token.length >= 20 && !!(await checkResetToken(token)) });
});

export const POST = publicRoute(async ({ req }) => {
  rateLimit(`reset:${await clientIp()}`, 20, 60 * 60_000);
  const b = await parseBody(req, Body);
  await completePasswordReset(b.token, b.password);
  return ok({ reset: true });
});
