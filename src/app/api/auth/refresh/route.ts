import { z } from "zod";
import { rotateRefresh } from "@/lib/auth";
import { ApiError, clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({ refreshToken: z.string().min(20).max(200) });

export const POST = publicRoute(async ({ req }) => {
  rateLimit(`refresh:${await clientIp()}`, 120, 15 * 60_000);
  const { refreshToken } = await parseBody(req, Body);
  const tokens = await rotateRefresh(refreshToken);
  if (!tokens) throw new ApiError(401, "Your session has ended. Please sign in again.", "session_ended");
  return ok(tokens);
});
