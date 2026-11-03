import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runMonitor } from "@/lib/monitor";

/** The 24×7 monitor: call every 5 minutes with the CRON_SECRET header (scripts/start.sh does this on Render). */
export async function POST(req: Request) {
  const want = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("x-cron-secret") ?? "";
  if (want.length < 16 || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await runMonitor()) });
  } catch (e) {
    console.error("[monitor] run failed", e);
    return NextResponse.json({ ok: false, error: "monitor run failed" }, { status: 500 });
  }
}
