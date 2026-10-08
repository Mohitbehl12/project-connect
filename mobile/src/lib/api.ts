import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** API base. On a phone, set EXPO_PUBLIC_API_URL to your computer's LAN address (see README). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

// --- token storage: Keychain/Keystore on devices, localStorage on web previews -------------
const REFRESH_KEY = "pc.refresh";
const store = {
  async get(k: string) {
    if (Platform.OS === "web") { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } }
    return SecureStore.getItemAsync(k);
  },
  async set(k: string, v: string) {
    if (Platform.OS === "web") { try { globalThis.localStorage?.setItem(k, v); } catch { /* ignore */ } return; }
    await SecureStore.setItemAsync(k, v);
  },
  async del(k: string) {
    if (Platform.OS === "web") { try { globalThis.localStorage?.removeItem(k); } catch { /* ignore */ } return; }
    await SecureStore.deleteItemAsync(k);
  },
};

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: (() => void) | null = null;

export const tokens = {
  async save(t: { accessToken: string; refreshToken: string }) {
    accessToken = t.accessToken;
    await store.set(REFRESH_KEY, t.refreshToken);
  },
  async hasSession() {
    return !!(accessToken || (await store.get(REFRESH_KEY)));
  },
  async refreshToken() {
    return store.get(REFRESH_KEY);
  },
  async clear() {
    accessToken = null;
    await store.del(REFRESH_KEY);
  },
  onSignedOut(fn: () => void) {
    onSignedOut = fn;
  },
};

/** Rotates the refresh token once, shared by every request that hit a 401 at the same time. */
async function refresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = await store.get(REFRESH_KEY);
      if (!rt) return false;
      try {
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) return false;
        await tokens.save(await res.json());
        return true;
      } catch {
        return false;
      }
    })().finally(() => setTimeout(() => (refreshing = null), 0));
  }
  return refreshing;
}

type Opts = { method?: string; body?: unknown; form?: FormData; auth?: boolean };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
      headers: {
        ...(opts.form ? {} : { "content-type": "application/json" }),
        ...(accessToken && opts.auth !== false ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });

  let res: Response;
  try {
    if (!accessToken && opts.auth !== false && (await store.get(REFRESH_KEY))) await refresh();
    res = await doFetch();
    if (res.status === 401 && opts.auth !== false && (await refresh())) res = await doFetch();
  } catch {
    throw new ApiError(0, "You're offline or the server can't be reached. Check your connection and try again.", "network");
  }

  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && opts.auth !== false) {
    await tokens.clear();
    onSignedOut?.();
  }
  if (!res.ok) {
    // Server messages are already written for people; anything else becomes a friendly generic line.
    const msg = typeof data?.error === "string" && res.status < 500 ? data.error : "Something went wrong on our side. Please try again.";
    throw new ApiError(res.status, msg, data?.code);
  }
  return data as T;
}

/** Signed media links from the local storage driver are relative; S3 links are absolute. */
export const mediaUrl = (u?: string | null) => (!u ? undefined : u.startsWith("http") ? u : `${API_URL}${u}`);
