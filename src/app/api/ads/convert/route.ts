import { recordConversion } from "@/lib/ads";
import { clientIp, ok, publicRoute } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * Conversion tracking for advertisers: call with ?key=<campaign conversion key>&click=<kn_click from the landing URL>.
 * Works as an image pixel (GET) or a server call (POST). Nothing about the member is involved or returned.
 */
async function handle(req: Request) {
  await rateLimit(`ad-conv:${await clientIp()}`, 600, 60 * 60_000);
  const u = new URL(req.url);
  return recordConversion(u.searchParams.get("key") ?? "", u.searchParams.get("click") ?? "");
}
export const GET = publicRoute(async ({ req }) => { await handle(req).catch(() => null); return new Response(new Uint8Array(GIF), { headers: { "content-type": "image/gif", "cache-control": "no-store" } }); });
export const POST = publicRoute(async ({ req }) => ok(await handle(req)));
