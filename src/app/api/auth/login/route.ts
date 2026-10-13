import { z } from "zod";
import { createSession } from "@/lib/auth";
import { clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { audit } from "@/lib/audit";
import { authenticate, nextRoute } from "@/lib/login";

const Body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128), totp: z.string().max(10).optional() });

/** Web sign-in: sets the session cookie. Native apps use /api/auth/token instead. */
export const POST = publicRoute(async ({ req }) => {
  const body = await parseBody(req, Body);
  const user = await authenticate(body.email, body.password, { ip: await clientIp(), platform: "web", deviceName: (req.headers.get("user-agent") ?? "").slice(0, 60), totp: body.totp });
  await createSession(user);
  await audit(user.id, "auth.login", "user", user.id);
  return ok({ next: nextRoute(user) });
});
