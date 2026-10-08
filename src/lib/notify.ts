import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

type NotifType = "MATCH" | "MESSAGE" | "LIKE" | "VERIFICATION" | "DATE" | "SUBSCRIPTION" | "SECURITY" | "REPORT" | "MODERATION";

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
}
