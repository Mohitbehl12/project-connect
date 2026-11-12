import { describe, expect, it } from "vitest";
import { ageFromDob, compatibilityBreakdown, distanceLabel, eligibility, haversineKm, mutualScore, profileCompleteness, scorePair, searchBox, DEFAULT_WEIGHTS, type MatchPerson } from "../../src/lib/matching";

const base = (over: Partial<MatchPerson> = {}): MatchPerson => ({
  id: "a", gender: "WOMAN", age: 28, lat: 28.61, lng: 77.21, city: "Delhi", country: "IN", intent: "LONG_TERM",
  interests: ["travel", "coffee", "reading"],
  lifestyle: { drinking: "SOCIAL", smoking: "NEVER", food: "VEG", exercise: "SOMETIMES", pets: "WANTS" },
  answers: { energy: 2, planning: 4, sharing: 3, conflict: 4, pace: 2, texting: 3 },
  completeness: 80, verified: true,
  prefs: { interestedIn: ["MAN"], ageMin: 25, ageMax: 34, maxDistanceKm: 30, intents: [], longDistance: false },
  ...over,
});
const man = (over: Partial<MatchPerson> = {}) =>
  base({ id: "b", gender: "MAN", age: 30, lat: 28.55, lng: 77.25, prefs: { interestedIn: ["WOMAN"], ageMin: 24, ageMax: 32, maxDistanceKm: 30, intents: [], longDistance: false }, ...over });

describe("eligibility", () => {
  it("accepts a mutual fit", () => expect(eligibility(base(), man())).toBeNull());
  it("requires both genders to match preferences", () => {
    expect(eligibility(base(), man({ prefs: { ...man().prefs, interestedIn: ["MAN"] } }))).toBe("gender_b");
  });
  it("enforces both age ranges", () => {
    expect(eligibility(base(), man({ age: 40 }))).toBe("age_a");
    expect(eligibility(base({ age: 35 }), man())).toBe("age_b");
  });
  it("enforces distance unless long distance is on", () => {
    const far = man({ lat: 19.07, lng: 72.88, city: "Mumbai" });
    expect(eligibility(base(), far)).toBe("distance");
    expect(eligibility(base({ prefs: { ...base().prefs, longDistance: true } }), { ...far, prefs: { ...far.prefs, longDistance: true } })).toBeNull();
  });
  it("respects intent filters", () => {
    expect(eligibility(base({ prefs: { ...base().prefs, intents: ["MARRIAGE"] } }), man())).toBe("intent_a");
  });
  it("never matches someone with themselves", () => expect(eligibility(base(), base())).toBe("self"));
});

describe("scorePair", () => {
  it("returns a bounded score and readable reasons", () => {
    const r = scorePair(base(), man());
    expect(r.score).toBeGreaterThanOrEqual(1);
    expect(r.score).toBeLessThanOrEqual(99);
    expect(r.reasons).toContain("Looking for the same kind of relationship");
    expect(r.reasons.some((x) => x.startsWith("You both enjoy"))).toBe(true);
    expect(r.reasons).toContain("Both in Delhi");
  });
  it("scores a closer fit higher than a weaker one", () => {
    const strong = scorePair(base(), man());
    const weak = scorePair(base(), man({
      intent: "CASUAL", interests: ["gaming"], verified: false, completeness: 20,
      lifestyle: { drinking: "REGULAR", smoking: "REGULAR", food: "NONVEG", exercise: "RARELY", pets: "ALLERGIC" },
      answers: { energy: 5, planning: 1, sharing: 1, conflict: 1, pace: 5, texting: 1 },
    }));
    expect(strong.score).toBeGreaterThan(weak.score + 25);
  });
  it("responds to admin weight changes", () => {
    const noIntent = { ...DEFAULT_WEIGHTS, intent: 0 };
    const casual = man({ intent: "CASUAL" });
    expect(scorePair(base(), casual, noIntent).score).toBeGreaterThan(scorePair(base(), casual).score);
  });
  it("overall score agrees with the per-factor bars", () => {
    const b = compatibilityBreakdown(base(), man({ intent: "CASUAL", interests: ["gaming"] }));
    const avg = b.bars.reduce((s: number, x: { value: number }) => s + x.value, 0) / b.bars.length;
    expect(Math.abs(b.overall - avg)).toBeLessThan(25);
  });
  it("never shows 100%", () => {
    const twin = man({ ...base(), id: "b", gender: "MAN", prefs: man().prefs });
    expect(scorePair(base(), twin).score).toBeLessThan(100);
  });
  it("mutual score is symmetric", () => {
    expect(mutualScore(base(), man()).score).toBe(mutualScore(man(), base()).score);
  });
});

describe("searchBox (database prefilter for distance)", () => {
  const inside = (b: ReturnType<typeof searchBox>, lat: number, lng: number) =>
    lat >= b.lat[0] && lat <= b.lat[1] && (!b.lng || (lng >= b.lng[0] && lng <= b.lng[1]));
  // Points at a given distance and bearing from an origin.
  const move = (lat: number, lng: number, km: number, bearingDeg: number): [number, number] => {
    const R = 6371, br = (bearingDeg * Math.PI) / 180, la = (lat * Math.PI) / 180, lo = (lng * Math.PI) / 180, d = km / R;
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
    const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return [(la2 * 180) / Math.PI, (lo2 * 180) / Math.PI];
  };
  it("never excludes anyone within the distance, at any bearing and latitude", () => {
    for (const [lat, lng] of [[28.61, 77.21], [12.97, 77.59], [59.9, 10.7], [-33.9, 151.2], [0, 0], [64.1, -21.9]])
      for (const km of [2, 30, 100, 500]) {
        const b = searchBox(lat, lng, km);
        for (let bearing = 0; bearing < 360; bearing += 15) {
          const [la, lo] = move(lat, lng, km, bearing);
          expect(haversineKm(lat, lng, la, lo)).toBeCloseTo(km, 0);
          expect(inside(b, la, lo)).toBe(true);
        }
      }
  });
  it("excludes people who are clearly too far", () => {
    const b = searchBox(28.61, 77.21, 30); // Delhi, 30 km
    expect(inside(b, 19.07, 72.87)).toBe(false); // Mumbai
    expect(inside(b, 28.45, 77.03)).toBe(true); // Gurugram
    expect(inside(b, 26.91, 75.79)).toBe(false); // Jaipur
  });
  it("falls back to latitude only where a longitude range can't express the area", () => {
    expect(searchBox(10, 179.9, 100).lng).toBeNull(); // crosses the antimeridian
    expect(searchBox(88.5, 0, 200).lng).toBeNull(); // near a pole
    expect(searchBox(28.61, 77.21, 30).lng).not.toBeNull();
  });
});

describe("helpers", () => {
  it("haversine is roughly right (Delhi → Mumbai ≈ 1150 km)", () => {
    const d = haversineKm(28.6139, 77.209, 19.076, 72.8777);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1200);
  });
  it("distance labels are coarse", () => {
    expect(distanceLabel(1.2, true)).toBe("Within 5 km");
    expect(distanceLabel(7.9, false)).toBe("Within 10 km");
    expect(distanceLabel(23, false)).toBe("About 20 km away");
    expect(distanceLabel(1149, false)).toBe("1150+ km away");
  });
  it("computes age correctly around birthdays", () => {
    const today = new Date("2026-10-08T00:00:00Z");
    expect(ageFromDob("2008-10-08", today)).toBe(18);
    expect(ageFromDob("2008-10-09", today)).toBe(17);
  });
  it("profile completeness rewards a fuller profile", () => {
    expect(profileCompleteness({})).toBe(0);
    expect(profileCompleteness({ bio: "x".repeat(50), photos: ["a", "b", "c"], education: "x", profession: "y", heightCm: 170, drinking: "S", smoking: "N", food: "V", exercise: "O", pets: "H", interests: ["a", "b", "c"], prompts: [{}], answerCount: 10 })).toBe(100);
  });
});
