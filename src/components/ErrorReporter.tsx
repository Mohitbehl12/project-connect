"use client";
import { useEffect } from "react";

// Sends website crashes and uncaught errors to the 24×7 monitor (scrubbed and grouped on the server).
let sent = 0;
export function reportClientError(message: string, stack?: string, kind: "crash" | "error" | "unhandled_rejection" = "error") {
  if (sent >= 10 || typeof window === "undefined") return; // a page in a loop must not flood the server
  sent++;
  const body = JSON.stringify({ message: String(message).slice(0, 2000), stack: stack?.slice(0, 6000), platform: "website", screen: window.location.pathname, browser: navigator.userAgent.slice(0, 120), kind });
  try { navigator.sendBeacon?.("/api/ops/client-error", new Blob([body], { type: "application/json" })) || fetch("/api/ops/client-error", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {}); } catch { /* never throw from the reporter */ }
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError(e.message, e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => reportClientError(String((e.reason as Error)?.message ?? e.reason), (e.reason as Error)?.stack, "unhandled_rejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
