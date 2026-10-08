// Compatibility engine — pure functions, no DB access, fully unit-testable.
// Weights are loaded from AppConfig ("matching.weights") so admins can tune them without a deploy.
import { INTENT_AFFINITY, INTERESTS, LIFESTYLE, type Intent, type LifestyleKey } from "./constants";

export type Weights = {
  intent: number; interests: number; personality: number; lifestyle: number;
  distance: number; age: number; quality: number;
};

export const DEFAULT_WEIGHTS: Weights = {
  intent: 25, interests: 15, personality: 20, lifestyle: 15, distance: 10, age: 5, quality: 10,
};

export type MatchPerson = {
  id: string;
  gender: string;
  age: number;
  lat: number;
  lng: number;
  city: string;
  country: string;
  intent: string;
  interests: string[];
  lifestyle: Partial<Record<LifestyleKey, string | null>>;
  answers: Record<string, number>;
  completeness: number;
  verified: boolean;
  prefs: {
    interestedIn: string[];
    ageMin: number;
    ageMax: number;
    maxDistanceKm: number;
    intents: string[];
    longDistance: boolean;
  };
};

export type ScoreResult = {
  score: number; // 0..100
  factors: Record<keyof Weights, number>; // each 0..1
  reasons: string[]; // user-facing, never reveals private data
  distanceKm: number;
};

const R = 6371;
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Coarse, privacy-preserving distance label. Never shows sub-kilometre precision. */
export function distanceLabel(km: number, sameCity: boolean): string {
  if (km < 3) return sameCity ? "Same neighbourhood area" : "Under 3 km away";
  if (km < 10) return `About ${Math.round(km)} km away`;
  if (km < 100) return `About ${Math.round(km / 5) * 5} km away`;
  return `${Math.round(km / 50) * 50}+ km away`;
}

export function ageFromDob(dob: string, today = new Date()): number {
  const d = new Date(dob + "T00:00:00Z");
  let age = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

/**
 * Hard filters: both people must fit each other's stated preferences.
 * Returns null when eligible, or a short machine reason when not (useful for debugging/tests).
 */
export function eligibility(a: MatchPerson, b: MatchPerson): string | null {
  if (a.id === b.id) return "self";
  if (!a.prefs.interestedIn.includes(b.gender)) return "gender_a";
  if (!b.prefs.interestedIn.includes(a.gender)) return "gender_b";
  if (b.age < a.prefs.ageMin || b.age > a.prefs.ageMax) return "age_a";
  if (a.age < b.prefs.ageMin || a.age > b.prefs.ageMax) return "age_b";
  const d = haversineKm(a.lat, a.lng, b.lat, b.lng);
  const aOk = d <= a.prefs.maxDistanceKm || a.prefs.longDistance;
  const bOk = d <= b.prefs.maxDistanceKm || b.prefs.longDistance;
  if (!aOk || !bOk) return "distance";
  if (a.prefs.intents.length && !a.prefs.intents.includes(b.intent)) return "intent_a";
  if (b.prefs.intents.length && !b.prefs.intents.includes(a.intent)) return "intent_b";
  return null;
}

function intentScore(a: string, b: string): number {
  if (a === b) return 1;
  return INTENT_AFFINITY[a as Intent]?.[b as Intent] ?? INTENT_AFFINITY[b as Intent]?.[a as Intent] ?? 0.1;
}

function interestScore(a: string[], b: string[]): { score: number; shared: string[] } {
  if (!a.length || !b.length) return { score: 0.3, shared: [] };
  const setB = new Set(b);
  const shared = a.filter((x) => setB.has(x));
  // Overlap relative to the smaller list — 3+ shared interests is already a strong signal.
  const score = Math.min(1, shared.length / Math.min(3, Math.min(a.length, b.length)));
  return { score, shared };
}

// Ordinal lifestyle values: closeness matters more than exact equality.
const ORDINAL: Partial<Record<LifestyleKey, string[]>> = {
  drinking: ["NEVER", "SOCIAL", "REGULAR"],
  smoking: ["NEVER", "SOCIAL", "REGULAR"],
  exercise: ["RARELY", "SOMETIMES", "OFTEN"],
};

function lifestyleScore(a: MatchPerson["lifestyle"], b: MatchPerson["lifestyle"]): { score: number; aligned: LifestyleKey[] } {
  const keys = Object.keys(LIFESTYLE) as LifestyleKey[];
  let total = 0, n = 0;
  const aligned: LifestyleKey[] = [];
  for (const k of keys) {
    const va = a[k], vb = b[k];
    if (!va || !vb) continue;
    n++;
    let s: number;
    const scale = ORDINAL[k];
    if (scale) {
      s = 1 - Math.abs(scale.indexOf(va) - scale.indexOf(vb)) / (scale.length - 1);
    } else if (k === "pets") {
      s = va === vb ? 1 : (va === "ALLERGIC" && vb === "HAS") || (vb === "ALLERGIC" && va === "HAS") ? 0 : 0.6;
    } else {
      // food: vegetarian-family choices are close to each other; ANY is flexible
      const veg = ["VEG", "VEGAN", "JAIN", "EGGETARIAN"];
      s = va === vb ? 1 : va === "ANY" || vb === "ANY" ? 0.8 : veg.includes(va) && veg.includes(vb) ? 0.7 : 0.4;
    }
    if (s >= 0.99) aligned.push(k);
    total += s;
  }
  return { score: n ? total / n : 0.5, aligned };
}

function personalityScore(a: Record<string, number>, b: Record<string, number>): { score: number; closest: string[] } {
  const keys = Object.keys(a).filter((k) => k in b);
  if (keys.length < 3) return { score: 0.5, closest: [] };
  const diffs = keys.map((k) => ({ k, d: Math.abs(a[k] - b[k]) }));
  const score = 1 - diffs.reduce((s, x) => s + x.d, 0) / (keys.length * 4);
  const closest = diffs.filter((x) => x.d === 0).map((x) => x.k);
  return { score, closest };
}

const PERSONALITY_REASON: Record<string, string> = {
  energy: "Similar idea of a good evening",
  planning: "Same approach to planning",
  sharing: "Similar way of opening up",
  conflict: "Handle disagreements the same way",
  pace: "Want to take things at the same pace",
  texting: "Similar texting rhythm",
  ambition: "Aligned on work–life focus",
  novelty: "Same appetite for new experiences",
  family: "Similar views on family involvement",
  affection: "Show care in similar ways",
};

export function scorePair(a: MatchPerson, b: MatchPerson, w: Weights = DEFAULT_WEIGHTS): ScoreResult {
  const distanceKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
  const intent = intentScore(a.intent, b.intent);
  const ints = interestScore(a.interests, b.interests);
  const life = lifestyleScore(a.lifestyle, b.lifestyle);
  const pers = personalityScore(a.answers, b.answers);
  const distance = Math.max(0, 1 - distanceKm / Math.max(5, a.prefs.maxDistanceKm));
  const mid = (a.prefs.ageMin + a.prefs.ageMax) / 2;
  const half = Math.max(1, (a.prefs.ageMax - a.prefs.ageMin) / 2);
  const age = Math.max(0, 1 - Math.abs(b.age - mid) / (half * 2));
  const quality = Math.min(1, (b.completeness / 100) * 0.7 + (b.verified ? 0.3 : 0));

  const factors = { intent, interests: ints.score, personality: pers.score, lifestyle: life.score, distance, age, quality };
  const totalW = Object.values(w).reduce((s, x) => s + x, 0) || 1;
  const raw = (Object.keys(factors) as (keyof Weights)[]).reduce((s, k) => s + factors[k] * w[k], 0) / totalW;
  // Spread scores into a readable 40–99 band; never show 100% — no pair is a guaranteed fit.
  const score = Math.round(40 + raw * 59);

  const reasons: string[] = [];
  if (a.intent === b.intent) reasons.push("Looking for the same kind of relationship");
  else if (intent >= 0.6) reasons.push("Compatible relationship goals");
  if (ints.shared.length) {
    const names = ints.shared.slice(0, 3).map((k) => (INTERESTS[k] ?? k).toLowerCase());
    reasons.push(`You both enjoy ${names.join(", ").replace(/, ([^,]*)$/, " and $1")}`);
  }
  if (a.city === b.city) reasons.push(`Both in ${a.city}`);
  // At most one personality reason so concrete, checkable reasons aren't crowded out.
  const pk = pers.closest.find((k) => PERSONALITY_REASON[k]);
  if (pk) reasons.push(PERSONALITY_REASON[pk]);
  if (life.aligned.includes("food")) reasons.push("Same food preferences");
  else if (life.aligned.includes("drinking") && life.aligned.includes("smoking")) reasons.push("Similar lifestyle habits");
  if (b.verified) reasons.push("Verified profile");

  return { score, factors, reasons: reasons.slice(0, 5), distanceKm };
}

/** Symmetric match score used when a mutual match is created. */
export function mutualScore(a: MatchPerson, b: MatchPerson, w: Weights = DEFAULT_WEIGHTS): ScoreResult {
  const ab = scorePair(a, b, w);
  const ba = scorePair(b, a, w);
  return { ...ab, score: Math.round((ab.score + ba.score) / 2) };
}

export function profileCompleteness(p: {
  bio?: string | null; photos?: string[]; education?: string | null; profession?: string | null;
  heightCm?: number | null; drinking?: string | null; smoking?: string | null; food?: string | null;
  exercise?: string | null; pets?: string | null; interests?: string[]; prompts?: unknown[]; answerCount?: number;
}): number {
  const checks = [
    (p.bio?.trim().length ?? 0) >= 40,
    (p.photos?.length ?? 0) >= 1,
    (p.photos?.length ?? 0) >= 3,
    !!p.education, !!p.profession, !!p.heightCm,
    !!p.drinking && !!p.smoking, !!p.food, !!p.exercise, !!p.pets,
    (p.interests?.length ?? 0) >= 3,
    (p.prompts?.length ?? 0) >= 1,
    (p.answerCount ?? 0) >= 8,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
