import "server-only";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendWebPush, type PushMessage } from "./webpush";
import { recordSignal } from "./ops";
import { COUNTRIES } from "./constants";

type NotifType = "MATCH" | "MESSAGE" | "LIKE" | "VERIFICATION" | "DATE" | "SUBSCRIPTION" | "SECURITY" | "REPORT" | "MODERATION" | "CALL" | "SAFETY";

const PREF_GATE: Partial<Record<NotifType, "notifyMatches" | "notifyMessages" | "notifyLikes">> = {
  MATCH: "notifyMatches", MESSAGE: "notifyMessages", LIKE: "notifyLikes",
};

/**
 * Creates an in-app notification, respecting the user's preferences.
 * Push / email / SMS delivery plugs in here (FCM, SES, MSG91/Twilio) — currently in-app only.
 */
export async function notify(userId: string, type: NotifType, title: string, body: string, link?: string) {
  const prefs = await db.query.preferences.findFirst({ where: eq(schema.preferences.userId, userId) });
  const gate = PREF_GATE[type];
  if (gate && prefs && prefs[gate] === false) return;
  await db.insert(schema.notifications).values({ userId, type, title, body, link });
  if (!(await shouldPush(userId, type, prefs))) return; // still in the in-app list, just no buzz
  void sendPush(userId, title, body, link);
  void sendWebPush(userId, { title, body, link, tag: type === "MESSAGE" && link ? `chat:${link}` : undefined });
}

// Never held back: safety, account security and live calls.
const ALWAYS_PUSH = new Set<NotifType>(["SAFETY", "SECURITY", "CALL"]);
const ACTIVITY = ["LIKE", "MATCH"] as const;

/** The hour (0–23) in a time zone. */
export function localHour(tz: string, at = new Date()) {
  try { return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(at)) % 24; } catch { return at.getUTCHours(); }
}
/** True when `hour` falls in quiet hours [start, end) — which may wrap past midnight (22 → 7). */
export function inQuietHours(hour: number, start: number | null | undefined, end: number | null | undefined) {
  if (start == null || end == null || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

async function shouldPush(userId: string, type: NotifType, prefs: { quietStart: number | null; quietEnd: number | null; activityPushCap: number } | undefined) {
  if (ALWAYS_PUSH.has(type) || !prefs) return true;
  if (prefs.quietStart != null && prefs.quietEnd != null) {
    const p = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, userId), columns: { country: true } });
    const tz = (COUNTRIES as Record<string, { tz?: string }>)[p?.country ?? ""]?.tz ?? "UTC";
    if (inQuietHours(localHour(tz), prefs.quietStart, prefs.quietEnd)) return false;
  }
  if (prefs.activityPushCap > 0 && (ACTIVITY as readonly string[]).includes(type)) {
    const [{ n }] = await db.select({ n: count() }).from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), inArray(schema.notifications.type, [...ACTIVITY]), gte(schema.notifications.createdAt, new Date(Date.now() - 86400_000))));
    if (n > prefs.activityPushCap) return false; // this one is already counted above
  }
  return true;
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
    recordSignal("push_app", res.ok && !(json?.data ?? []).some((r) => r.status === "error" && r.details?.error !== "DeviceNotRegistered"));
    // Drop tokens Expo reports as no longer registered.
    for (const [i, r] of (json?.data ?? []).entries())
      if (r.status === "error" && r.details?.error === "DeviceNotRegistered")
        await db.delete(schema.devices).where(eq(schema.devices.pushToken, targets[i].pushToken));
  } catch (e) {
    console.warn("[push] send failed", (e as Error).message);
    recordSignal("push_app", false);
  }
}
