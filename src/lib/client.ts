"use client";
import { useCallback, useEffect, useState } from "react";

export class ClientError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (typeof window !== "undefined" && (data?.code === "staff_unlock_required" || data?.code === "staff_mfa_required")) {
    window.dispatchEvent(new Event("staff-locked")); // AdminShell shows the unlock screen
  } else if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth") && path !== "/api/staff/unlock") {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok) throw new ClientError(res.status, data?.error ?? "Something went wrong.", data?.code);
  return data as T;
}

/** Fetch-on-mount hook with manual reload. */
export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ClientError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e as ClientError);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

export function formatMoney(minor: number, currency: string) {
  const zeroDecimal = ["JPY"].includes(currency);
  const value = zeroDecimal ? minor : minor / 100;
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(value);
}

export function timeAgo(d: string | Date) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString();
}
