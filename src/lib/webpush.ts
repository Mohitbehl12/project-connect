import "server-only";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { db, schema } from "@/db";
import { open, seal } from "./crypto";
import { ApiError } from "./http";

// Browser push (Web Push with VAPID): notifications for the home-screen web app on iPhone (iOS 16.4+)
// and for Android browsers, without Apple or Google developer accounts.
//
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY from the environment if set; otherwise generated once on first
// use and kept in the database, the private key encrypted with the field-encryption key. They must not
// change afterwards, or every device has to turn notifications on again.
// Payloads carry only the notification's title, body and link — the same text as the in-app notification,
// never message contents.

const STORE_KEY = "secret:webpush.vapid";
let keys: { publicKey: string; privateKey: string } | null = null;

async function vapid() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return (keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  const row = await db.query.appConfig.findFirst({ where: eq(schema.appConfig.key, STORE_KEY) });
  if (row) {
    const v = JSON.parse(row.value) as { publicKey: string; privateKey: string };
    return (keys = { publicKey: v.publicKey, privateKey: open(v.privateKey, STORE_KEY) });
  }
  const fresh = webpush.generateVAPIDKeys();
  await db.insert(schema.appConfig).values({ key: STORE_KEY, value: JSON.stringify({ publicKey: fresh.publicKey, privateKey: seal(fresh.privateKey, STORE_KEY) }), updatedBy: "system" }).onConflictDoNothing();
  // Another process may have won the race: read back whatever is stored.
  keys = null;
  return vapid();
}

// Only the browsers' real push services. Anything else could make the server send requests to hosts an
// attacker chose (including internal ones). WEB_PUSH_ALLOWED_HOSTS adds hosts (used by the test suite).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^([\w-]+\.)*push\.apple\.com$/, /^([\w-]+\.)*push\.services\.mozilla\.com$/, /^([\w-]+\.)*notify\.windows\.com$/];
export function allowedEndpoint(endpoint: string) {
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const extra = (process.env.WEB_PUSH_ALLOWED_HOSTS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return PUSH_HOSTS.some((r) => r.test(u.hostname)) || extra.includes(u.host);
}

export async function webPushPublicKey() { return (await vapid()).publicKey; }
export const webPushEnabled = () => process.env.WEB_PUSH_ENABLED !== "false";

const subject = () => `mailto:${process.env.PUSH_CONTACT_EMAIL || process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] || process.env.EMAIL_FROM || "support@example.com"}`;

export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  if (!allowedEndpoint(sub.endpoint)) throw new ApiError(422, "endpoint: This browser's push service isn't supported.", "push_endpoint");
  await db.insert(schema.webPushSubscriptions).values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({ target: schema.webPushSubscriptions.endpoint, set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
}

export async function removeSubscription(userId: string, endpoint: string) {
  const row = await db.query.webPushSubscriptions.findFirst({ where: eq(schema.webPushSubscriptions.endpoint, endpoint) });
  if (row && row.userId === userId) await db.delete(schema.webPushSubscriptions).where(eq(schema.webPushSubscriptions.id, row.id));
}

export type PushMessage = { title: string; body: string; link?: string; tag?: string; urgent?: boolean };

/** Sends to every browser this person turned notifications on in. Never throws. */
export async function sendWebPush(userId: string, msg: PushMessage) {
  if (!webPushEnabled()) return;
  try {
    const subs = await db.select().from(schema.webPushSubscriptions).where(eq(schema.webPushSubscriptions.userId, userId));
    if (!subs.length) return;
    const k = await vapid();
    const payload = JSON.stringify({ title: msg.title, body: msg.body, link: msg.link ?? "/", tag: msg.tag });
    const dead: string[] = [];
    await Promise.all(subs.map(async (s) => {
      if (!allowedEndpoint(s.endpoint)) return dead.push(s.id);
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          vapidDetails: { subject: subject(), publicKey: k.publicKey, privateKey: k.privateKey },
          TTL: msg.urgent ? 45 : 60 * 60 * 24, urgency: msg.urgent ? "high" : "normal", timeout: 5000,
        });
        await db.update(schema.webPushSubscriptions).set({ lastOkAt: new Date() }).where(eq(schema.webPushSubscriptions.id, s.id));
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id); // the browser unsubscribed or the app was removed
      }
    }));
    if (dead.length) await db.delete(schema.webPushSubscriptions).where(inArray(schema.webPushSubscriptions.id, dead));
  } catch { /* push is best-effort */ }
}
