import "server-only";
import { getConfig } from "./config";
import { localScanEnabled, scanLocally } from "./vision";

// Every new photo is checked before anyone else can see it.
//   Admin → Settings → Photo checks:
//   "auto"   — automatic check: Sightengine when SIGHTENGINE_USER + SIGHTENGINE_SECRET are set, otherwise the
//              nudity model that runs on our own server (workers/vision.mjs; PHOTO_SCAN_LOCAL=false turns it
//              off). If no check can run, staff review the photo in Admin → Photo review.
//   "review" — staff review every photo, even when the automatic check passes.
//   "off"    — no checks. Development and test machines only: on a real server it behaves like "review".
// Policy: explicit content is refused; borderline photos wait for a person; swimwear and similar are fine.
// The Sightengine call is untested against a live account. The on-server model is an automated first line,
// not perfect: anything it's unsure about goes to a person.
export type ScreenResult = { status: "LIVE" | "PENDING" | "REJECTED"; reason: string };

export const EXPLICIT_REJECT = 0.6;
export const EXPLICIT_REVIEW = 0.2;

/** Pure decision for the on-server model's classes (Porn, Hentai, Sexy, Neutral, Drawing). Sexy = swimwear etc., allowed. */
export function decideLocal(scores: Record<string, number>): ScreenResult {
  const explicit = Math.max(scores.Porn ?? 0, scores.Hentai ?? 0);
  if (explicit >= 0.85) return { status: "REJECTED", reason: "explicit" };
  if (explicit >= 0.3) return { status: "PENDING", reason: "borderline" };
  return { status: "LIVE", reason: "passed" };
}

/** Pure decision from the scanner's scores (unit tested). */
export function decide(nudity: Record<string, unknown> | undefined): ScreenResult {
  const n = (k: string) => (typeof nudity?.[k] === "number" ? (nudity[k] as number) : 0);
  const explicit = Math.max(n("sexual_activity"), n("sexual_display"), n("erotica"), n("sextoy"));
  if (explicit >= EXPLICIT_REJECT) return { status: "REJECTED", reason: "explicit" };
  if (explicit >= EXPLICIT_REVIEW) return { status: "PENDING", reason: "borderline" };
  return { status: "LIVE", reason: "passed" };
}

async function sightengine(image: Buffer): Promise<ScreenResult> {
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(image)], { type: "image/webp" }), "photo.webp");
  form.append("models", "nudity-2.0");
  form.append("api_user", process.env.SIGHTENGINE_USER!);
  form.append("api_secret", process.env.SIGHTENGINE_SECRET!);
  const res = await fetch("https://api.sightengine.com/1.0/check.json", { method: "POST", body: form, signal: AbortSignal.timeout(15_000) });
  const j = await res.json().catch(() => ({})) as { status?: string; nudity?: Record<string, unknown>; error?: { message?: string } };
  if (!res.ok || j.status !== "success") throw new Error(`Sightengine: ${j.error?.message ?? res.status}`);
  return decide(j.nudity);
}

export async function screenPhoto(image: Buffer): Promise<ScreenResult> {
  const mode = await getConfig("moderation.photoScreening");
  // "off" exists for local testing. On a real server it must never publish an unchecked photo, so there it
  // behaves like "review": a person looks first.
  if (mode === "off") return isLocalDev() ? { status: "LIVE", reason: "checks off" } : { status: "PENDING", reason: "checks off: staff review" };
  const scanner = !!(process.env.SIGHTENGINE_USER && process.env.SIGHTENGINE_SECRET);
  let r: ScreenResult | null = null;
  if (scanner) {
    try { r = await sightengine(image); }
    catch (e) { console.error("[photos] automatic check failed, sending to review:", (e as Error).message); r = { status: "PENDING", reason: "scanner unavailable" }; }
  } else if (localScanEnabled()) {
    const scores = await scanLocally(image).catch(() => null);
    r = scores ? decideLocal(scores) : { status: "PENDING", reason: "scanner unavailable" };
  }
  if (r?.status === "REJECTED") return r;
  if (mode === "review") return { status: "PENDING", reason: "staff review" };
  if (r) return r;
  // No scanner: a person checks it — except on a development machine.
  return isLocalDev() ? { status: "LIVE", reason: "development" } : { status: "PENDING", reason: "staff review" };
}

/**
 * Only an explicit development or test environment may publish a photo nobody checked. An unset or unknown
 * NODE_ENV is treated as a real server, so a misconfigured deployment fails closed.
 */
function isLocalDev() {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}
