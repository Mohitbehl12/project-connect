import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runBillingJobs } from "@/lib/billing";
import { maybeBackup } from "@/lib/backup";
import { runRetention } from "@/lib/privacy";

/** Scheduled jobs (call every 15–60 minutes from a cron service with the CRON_SECRET header). */
export async function POST(req: Request) {
  const want = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("x-cron-secret") ?? "";
  if (want.length < 16 || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const billing = await runBillingJobs();
  const retention = await runRetention();
  const backup = await maybeBackup();
  return NextResponse.json({ ok: true, billing, retention, backup });
}
