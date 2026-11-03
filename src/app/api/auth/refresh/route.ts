import { createHash } from "node:crypto";
import { z } from "zod";
import { rotateRefresh } from "@/lib/auth";
import { ApiError, clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({ refreshToken: z.string().min(20).max(200) });

/**
 * Rate limits: per session (a token can't be hammered), plus a generous per-address ceiling. Mobile networks
 * and offices put many people behind one address, so a tight per-address limit used to sign out everyone
 * there at once (found by the QA screen sweep: 120 refreshes per 15 minutes from one address → 429s).
 */
export const POST = publicRoute(async ({ req }) => {
  const { refreshToken } = await parseBody(req, Body);
  const tokenKey = createHash("sha256").update(refreshToken).digest("hex").slice(0, 32);
  await rateLimit(`refresh-token:${tokenKey}`, 30, 15 * 60_000);
  await rateLimit(`refresh:${await clientIp()}`, 3000, 15 * 60_000);
  const tokens = await rotateRefresh(refreshToken);
  if (!tokens) throw new ApiError(401, "Your session has ended. Please sign in again.", "session_ended");
  return ok(tokens);
});
