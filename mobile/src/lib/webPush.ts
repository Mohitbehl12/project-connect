// Notifications for the web version of the app (home-screen app on iPhone, Chrome on Android).
// iPhone only allows them once the app has been added to the Home Screen (iOS 16.4+), and the request
// must come from a tap, so the app shows a button rather than asking on its own.
import { api } from "./api";
import { recordConsent } from "./consent";

export type WebPushState = "unsupported" | "needs-install" | "denied" | "off" | "on";
const G = globalThis as any;

const isIos = () => /iPhone|iPad|iPod/.test(G.navigator?.userAgent ?? "");
const standalone = () => G.matchMedia?.("(display-mode: standalone)").matches || G.navigator?.standalone === true;

function urlB64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = G.atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch: string) => ch.charCodeAt(0));
}

async function registration() {
  if (!G.navigator?.serviceWorker) return null;
  return (await G.navigator.serviceWorker.getRegistration("/app/")) ?? G.navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" });
}

/** Registers the service worker early so a later "turn on" tap is instant. */
export function prepareWebPush() { registration().catch(() => {}); }

export async function webPushState(): Promise<WebPushState> {
  if (isIos() && !standalone()) return G.navigator?.serviceWorker ? "needs-install" : "unsupported";
  if (!G.navigator?.serviceWorker || !G.PushManager || !G.Notification) return "unsupported";
  if (G.Notification.permission === "denied") return "denied";
  const reg = await registration().catch(() => null);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return sub && G.Notification.permission === "granted" ? "on" : "off";
}

/** Must be called from a tap. Returns the new state. */
export async function enableWebPush(): Promise<WebPushState> {
  const state = await webPushState();
  if (state === "unsupported" || state === "needs-install" || state === "denied") return state;
  const perm = await G.Notification.requestPermission();
  recordConsent("PUSH", perm === "granted");
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const { publicKey, enabled } = await api<{ publicKey: string | null; enabled: boolean }>("/api/push/web");
  if (!enabled || !publicKey) return "unsupported";
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  try {
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(publicKey) });
  } catch {
    throw new Error("Couldn't turn on notifications on this device. Check that notifications are allowed for this app in your phone's Settings, then try again.");
  }
  await api("/api/push/web", { body: sub.toJSON() });
  return "on";
}

/** On sign-out: this browser stops getting the previous person's notifications. */
export async function disableWebPush() {
  try {
    const reg = await G.navigator?.serviceWorker?.getRegistration("/app/");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api("/api/push/web", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  } catch { /* nothing to undo */ }
}
