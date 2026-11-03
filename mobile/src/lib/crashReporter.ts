import Constants from "expo-constants";
import { Platform } from "react-native";
import { API_URL } from "./api";

// Sends app crashes and uncaught errors to the 24×7 monitor. The server scrubs and groups them; nothing
// identifying is sent (no messages, tokens or profile data) — only the error, the screen and the app version.
let sent = 0;
let screen = "unknown";
export const setCrashScreen = (s: string) => { screen = s; };

export function reportError(e: unknown, kind: "crash" | "error" | "unhandled_rejection" = "error") {
  if (sent >= 10) return; // a screen stuck in a loop must not flood the server
  sent++;
  const err = e as Error;
  fetch(`${API_URL}/api/ops/client-error`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: String(err?.message ?? e).slice(0, 2000), stack: err?.stack?.slice(0, 6000), platform: Platform.OS === "web" ? "web" : Platform.OS, screen, kind,
      appVersion: Constants.expoConfig?.version ?? "unknown" }),
  }).catch(() => {});
}

/** Install once at start-up: uncaught JS errors (native) and window errors (web build). */
export function installCrashReporter() {
  const g = globalThis as any;
  if (g.__knCrashReporter) return;
  g.__knCrashReporter = true;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.addEventListener("error", (ev) => { if (!/ResizeObserver/.test(ev.message)) reportError(ev.error ?? ev.message); });
    window.addEventListener("unhandledrejection", (ev) => reportError(ev.reason, "unhandled_rejection"));
    return;
  }
  const EU = g.ErrorUtils;
  if (EU?.setGlobalHandler) {
    const prev = EU.getGlobalHandler?.();
    EU.setGlobalHandler((error: Error, isFatal?: boolean) => { reportError(error, isFatal ? "crash" : "error"); prev?.(error, isFatal); });
  }
}
