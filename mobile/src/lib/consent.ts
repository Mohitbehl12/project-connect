import { api } from "./api";

export type ConsentKind = "MARKETING" | "LOCATION" | "CAMERA" | "MICROPHONE" | "VIDEO_CALLS" | "PUSH" | "PROFILE_VISIBLE";

/**
 * Records the person's choice next to a phone permission prompt (camera, microphone, notifications), so it
 * shows in Privacy Center › Your consents. Fire-and-forget: never blocks or breaks the feature.
 */
export function recordConsent(kind: ConsentKind, granted: boolean) {
  api("/api/consents", { body: { kind, granted } }).catch(() => {});
}
