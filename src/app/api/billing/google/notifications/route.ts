import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { applyStoreState } from "@/lib/billing";
import { decodeGoogleNotification, googleSubscription } from "@/lib/payments/stores";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Google Play real-time developer notifications, pushed by Pub/Sub to
 *   https://<your domain>/api/billing/google/notifications?token=<GOOGLE_RTDN_TOKEN>
 * The notice itself is not trusted: we take the purchase token from it and ask Google for the real state.
 */
export async function POST(req: Request) {
  const secret = process.env.GOOGLE_RTDN_TOKEN ?? "";
  const given = new URL(req.url).searchParams.get("token") ?? "";
  if (!secret || !same(given, secret)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let n;
  try { n = decodeGoogleNotification(await req.json()); } catch { return NextResponse.json({ ok: true, ignored: true }); }
  const [ev] = await db.insert(schema.webhookEvents).values({ provider: "GOOGLE", eventId: n.id, type: n.type }).onConflictDoNothing().returning();
  if (!ev) return NextResponse.json({ ok: true, duplicate: true });
  try {
    const r = n.purchaseToken ? await applyStoreState(await googleSubscription(n.purchaseToken)) : null;
    await db.update(schema.webhookEvents).set({ status: r?.applied ? "PROCESSED" : "IGNORED", processedAt: new Date() }).where(eq(schema.webhookEvents.id, ev.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    await db.delete(schema.webhookEvents).where(eq(schema.webhookEvents.id, ev.id)); // let Pub/Sub retry
    return NextResponse.json({ error: "Try again" }, { status: 500 });
  }
}
