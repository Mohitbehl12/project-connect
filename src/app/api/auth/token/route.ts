import { z } from "zod";
import { issueTokens } from "@/lib/auth";
import { clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { audit } from "@/lib/audit";
import { authenticate } from "@/lib/login";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
  deviceName: z.string().max(80).optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

/** Native sign-in: returns an access token (15 min) and a rotating refresh token (30 days). */
export const POST = publicRoute(async ({ req }) => {
  const body = await parseBody(req, Body);
  const user = await authenticate(body.email, body.password, await clientIp());
  const tokens = await issueTokens(user, { name: body.deviceName, platform: body.platform });
  await audit(user.id, "auth.token", "user", user.id, { platform: body.platform });
  return ok({ ...tokens, onboardingStep: user.onboardingStep, role: user.role });
});
