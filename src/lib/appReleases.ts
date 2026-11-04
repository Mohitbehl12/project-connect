// iPhone, Android and the web app share one codebase and one server, but each is released on its own:
// its own version numbers, store listing, minimum supported version, and feature switches. The app asks
// /api/public/app-config on start (sending x-platform and x-app-version) and adapts.
// Switches hide a feature in that app's screens; they are not a security control — server rules still apply.

export const PLATFORMS = ["ios", "android", "web"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const APP_FEATURES = {
  calls: "Voice and video calls",
  checkin: "Date safety check-in",
  cupid: "Cupid conversation ideas",
  ads: "Sponsored cards",
  referrals: "Invite & earn",
  premium: "Buying Premium in the app",
  feedback: "In-app feedback",
} as const;
export type AppFeature = keyof typeof APP_FEATURES;

export type PlatformRelease = {
  minVersion: string; // older versions must update before continuing
  latestVersion: string; // older versions see a gentle "update available"
  storeUrl: string; // App Store / Play Store link (empty = not published yet)
  message: string; // optional note shown with an update prompt
  features: Partial<Record<AppFeature, boolean>>; // missing = on
};

export const DEFAULT_RELEASE: PlatformRelease = { minVersion: "1.0.0", latestVersion: "1.0.0", storeUrl: "", message: "", features: {} };

/** Compares dotted versions numerically: 1.10.0 > 1.9.3. Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string) {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0), pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function asPlatform(v: string | null | undefined): Platform {
  return v === "ios" || v === "android" ? v : "web";
}

/** What one app should do: which features to show and whether it must or may update. */
export function appConfigFor(all: Partial<Record<Platform, PlatformRelease>>, platform: Platform, appVersion: string | null) {
  const r = { ...DEFAULT_RELEASE, ...(all[platform] ?? {}) };
  const features = Object.fromEntries(Object.keys(APP_FEATURES).map((k) => [k, r.features?.[k as AppFeature] !== false])) as Record<AppFeature, boolean>;
  // The web app always runs the newest build the server hosts, so it never needs to update.
  const known = platform !== "web" && !!appVersion && /^\d+(\.\d+){0,3}$/.test(appVersion);
  return {
    platform, features,
    minVersion: r.minVersion, latestVersion: r.latestVersion, storeUrl: r.storeUrl || null, message: r.message || null,
    updateRequired: known && compareVersions(appVersion!, r.minVersion) < 0,
    updateAvailable: known && compareVersions(appVersion!, r.latestVersion) < 0,
  };
}
