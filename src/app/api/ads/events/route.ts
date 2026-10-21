import { z } from "zod";
import { recordEvent } from "@/lib/ads";
import { clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

/** Impression or video view, identified by the signed ad token (works for the website banner too). */
export const POST = publicRoute(async ({ req }) => {
  await rateLimit(`ad-event:${await clientIp()}`, 600, 60 * 60_000);
  const b = await parseBody(req, z.object({ token: z.string().max(400), kind: z.enum(["IMPRESSION", "VIDEO_VIEW"]) }));
  return ok(await recordEvent(b.token, b.kind));
});
