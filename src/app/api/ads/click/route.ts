import { NextResponse } from "next/server";
import { recordEvent } from "@/lib/ads";
import { clientIp, errorResponse, publicRoute } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

/** Counts a click and sends the person to the advertiser (with a click id for conversion reports, nothing else). */
export const GET = publicRoute(async ({ req }) => {
  try {
    await rateLimit(`ad-click:${await clientIp()}`, 300, 60 * 60_000);
    const r = await recordEvent(new URL(req.url).searchParams.get("t") ?? "", "CLICK");
    if (!r.url) return NextResponse.json({ ok: true });
    return NextResponse.redirect(r.url, 302);
  } catch (e) { return errorResponse(e); }
});
