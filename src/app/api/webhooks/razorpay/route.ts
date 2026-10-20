import { captureByProviderOrder } from "@/lib/style/server";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { applyEvent } from "@/lib/billing";
import { parseRazorpayEvent, verifyWebhookSignature } from "@/lib/payments/razorpay";

/**
 * Razorpay webhooks — the source of truth for payments. Each call is:
 *  1. authenticated: HMAC-SHA256 of the raw body must match X-Razorpay-Signature (else 400, nothing stored);
 *  2. idempotent: the event id is recorded once; repeats return 200 without re-applying;
 *  3. logged: every event's id, type and outcome is kept in webhook_events (no card or account data).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    console.warn("[webhook] razorpay signature rejected");
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const eventId = req.headers.get("x-razorpay-event-id") ?? createHash("sha256").update(raw).digest("hex").slice(0, 40);
  const type = String(body.event ?? "unknown").slice(0, 60);

  const inserted = await db.insert(schema.webhookEvents).values({ provider: "RAZORPAY", eventId, type }).onConflictDoNothing().returning();
  if (!inserted.length) {
    const prev = await db.query.webhookEvents.findFirst({ where: and(eq(schema.webhookEvents.provider, "RAZORPAY"), eq(schema.webhookEvents.eventId, eventId)) });
    if (prev?.status !== "FAILED") return NextResponse.json({ ok: true, duplicate: true });
  }
  try {
    const events = parseRazorpayEvent(body);
    const results = [];
    for (const ev of events) {
      // A clothing order (Kinara Style) is paid through its own gateway order, not a subscription.
      if (ev.t === "CAPTURED" && ev.orderId) {
        const style = await captureByProviderOrder(ev.orderId, ev.providerPaymentId);
        if (style) { results.push(`style:${style}`); continue; }
      }
      results.push(await applyEvent(ev));
    }
    await db.update(schema.webhookEvents).set({ status: events.length ? "PROCESSED" : "IGNORED", processedAt: new Date(), error: null })
      .where(and(eq(schema.webhookEvents.provider, "RAZORPAY"), eq(schema.webhookEvents.eventId, eventId)));
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error("[webhook] razorpay processing failed", e);
    await db.update(schema.webhookEvents).set({ status: "FAILED", error: String((e as Error).message).slice(0, 300) })
      .where(and(eq(schema.webhookEvents.provider, "RAZORPAY"), eq(schema.webhookEvents.eventId, eventId)));
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // Razorpay retries
  }
}
