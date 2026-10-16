import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { applyStoreState } from "@/lib/billing";
import { decodeAppleNotification } from "@/lib/payments/stores";

/**
 * App Store Server Notifications V2 (set this URL in App Store Connect → App Information).
 * The payload is signed by Apple and verified before anything changes. Each notice is processed once.
 */
export async function POST(req: Request) {
  let body: { signedPayload?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  if (!body.signedPayload) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  let n;
  try { n = await decodeAppleNotification(body.signedPayload); } catch { return NextResponse.json({ error: "Not verified" }, { status: 400 }); }
  const [ev] = await db.insert(schema.webhookEvents).values({ provider: "APPLE", eventId: n.id, type: n.type }).onConflictDoNothing().returning();
  if (!ev) return NextResponse.json({ ok: true, duplicate: true });
  try {
    const r = n.state ? await applyStoreState(n.state) : null;
    await db.update(schema.webhookEvents).set({ status: r?.applied ? "PROCESSED" : "IGNORED", processedAt: new Date() }).where(eq(schema.webhookEvents.id, ev.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    await db.update(schema.webhookEvents).set({ status: "FAILED", error: String((e as Error).message).slice(0, 300) }).where(eq(schema.webhookEvents.id, ev.id));
    // Let Apple retry later: remove the record so the retry is processed.
    await db.delete(schema.webhookEvents).where(eq(schema.webhookEvents.id, ev.id));
    return NextResponse.json({ error: "Try again" }, { status: 500 });
  }
}
