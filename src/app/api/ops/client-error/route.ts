import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { ApiError, clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { recordIncident, routeKey, scrub } from "@/lib/ops";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  message: z.string().max(2000),
  stack: z.string().max(6000).optional(),
  platform: z.enum(["ios", "android", "web", "website"]),
  screen: z.string().max(200).default("unknown"),
  appVersion: z.string().max(40).optional(),
  browser: z.string().max(120).optional(),
  kind: z.enum(["crash", "error", "unhandled_rejection"]).default("error"),
});

/**
 * Crash and error reports from the app and website. Public (a crash can happen before sign-in) but rate-limited
 * and size-capped; everything is scrubbed and grouped into incidents. Nothing here is shown to other members.
 */
export const POST = publicRoute(async ({ req }) => {
  if (Number(req.headers.get("content-length") ?? 0) > 10_000) throw new ApiError(413, "Report too large.", "too_large");
  await rateLimit(`client-error:${await clientIp()}`, 60, 10 * 60_000);
  const b = await parseBody(req, Body);
  // Browser-extension and network noise isn't ours to fix.
  if (/ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:|Failed to fetch|Load failed|NetworkError/i.test(b.message)) return ok({ ignored: true });
  const user = await currentUser().catch(() => null);
  const screen = routeKey(b.screen.startsWith("/") ? b.screen : `/${b.screen}`);
  const service = `${b.platform} ${screen}`;
  const inc = await recordIncident({
    kind: "CLIENT_ERROR", service, title: `${b.kind === "crash" ? "Crash" : "Error"} on ${service}: ${scrub(b.message, 100)}`, message: b.message, stack: b.stack,
    severity: b.kind === "crash" ? "HIGH" : undefined,
    context: { platform: b.platform, screen, appVersion: b.appVersion, browser: b.browser, kind: b.kind }, userId: user?.id ?? null,
  });
  return ok({ received: true, code: inc?.code ?? null }, 201);
});
