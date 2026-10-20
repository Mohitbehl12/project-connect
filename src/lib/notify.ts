import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendWebPush, type PushMessage } from "./webpush";

type NotifType = "MATCH" | "MESSAGE" | "LIKE" | "VERIFICATION" | "DATE" | "SUBSCRIPTION" | "SECURITY" | "REPORT" | "MODERATION" | "CALL";

const PREF_GATE: Partial<Record<NotifType, "notifyMatches" | "notifyMessages" | "notifyLikes">> = {
  MATCH: "notifyMatches", MESSAGE: "notifyMessages", LIKE: "notifyLikes",
};

/**
 * Creates an in-app notification, respecting the user's preferences.
 * Push / email / SMS delivery plugs in here (FCM, SES, MSG91/Twilio) — currently in-app only.
 */
export async function notify(userId: string, type: NotifType, title: string, body: string, link?: string) {
  const gate = PREF_GATE[type];
  if (gate) {
    const prefs = await db.query.preferences.findFirst({ where: eq(schema.preferences.userId, userId) });
    if (prefs && prefs[gate] === false) return;
  }
  await db.insert(schema.notifications).values({ userId, type, title, body, link });
  void sendPush(userId, title, body, link);
  void sendWebPush(userId, { title, body, link, tag: type === "MESSAGE" && link ? `chat:${link}` : undefined });
}

/** A push without an in-app notification (an incoming call: it's only useful in the moment). */
export async function pushNow(userId: string, msg: PushMessage) {
  void sendPush(userId, msg.title, msg.body, msg.link);
  void sendWebPush(userId, msg);
}

/**
 * Push through the Expo Push service (one API for APNs and FCM). Enabled with PUSH_ENABLED=true.
 * Payloads never include message text or names beyond what the in-app notification already shows.
 * Fire-and-forget: a push failure must never fail the request that caused it.
 */
async function sendPush(userId: string, title: string, body: string, link?: string) {
  if (process.env.PUSH_ENABLED !== "true") return;
  try {
    const targets = await db.select().from(schema.devices).where(eq(schema.devices.userId, userId));
    if (!targets.length) return;
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(targets.map((d) => ({ to: d.pushToken, title, body, sound: "default", data: { link } }))),
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
    // Drop tokens Expo reports as no longer registered.
    for (const [i, r] of (json?.data ?? []).entries())
      if (r.status === "error" && r.details?.error === "DeviceNotRegistered")
        await db.delete(schema.devices).where(eq(schema.devices.pushToken, targets[i].pushToken));
  } catch (e) {
    console.warn("[push] send failed", (e as Error).message);
  }
}
