import { z } from "zod";
import { clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { startPasswordReset } from "@/lib/passwordReset";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/** "Forgot password": always the same answer, so it never reveals whether an email is registered. */
export const POST = publicRoute(async ({ req }) => {
  const ip = await clientIp();
  await rateLimit(`forgot:${ip}`, 10, 60 * 60_000);
  const { email } = await parseBody(req, Body);
  await rateLimit(`forgot:${email}`, 3, 60 * 60_000);
  const r = await startPasswordReset(email, ip);
  return ok({ sent: true, message: "If that email has an account, we've sent a link to reset the password. It expires in 30 minutes.", ...r });
});
