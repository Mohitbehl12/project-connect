// QA campaign, logic part: many generated cases (seeded, so failures replay) over matching, distance and age,
// message screening, coupons, ad targeting and the app's colour themes.
import { describe, expect, it } from "vitest";
import { ageFromDob, compatibilityBreakdown, distanceLabel, eligibility, haversineKm, mutualScore, scorePair, type MatchPerson } from "../../src/lib/matching";
import { screenMessage } from "../../src/lib/moderation";
import { checkCoupon, formatMoney, minimumCharge, type Buyer, type CouponRow } from "../../src/lib/pricing";
import { Targeting, checkUrl, matchesTargeting } from "../../src/lib/ads";
import { THEMES, contrast } from "../../mobile/src/theme/themes";

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const R = rng(42);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
const GENDERS = ["WOMAN", "MAN", "NONBINARY"], INTENTS = ["MARRIAGE", "LONG_TERM", "LONG_OPEN", "FIGURING_OUT", "CASUAL", "FRIENDS"];
const INTS = ["travel", "coffee", "reading", "films", "gym", "music_live", "cooking", "trekking", "art", "yoga", "gaming", "dogs"];
const CITIES: [string, number, number][] = [["Delhi", 28.61, 77.21], ["Gurugram", 28.46, 77.03], ["Mumbai", 19.07, 72.88], ["Bengaluru", 12.97, 77.59], ["Pune", 18.52, 73.86], ["London", 51.5, -0.12]];
const LS = { drinking: ["NEVER", "SOCIAL", "OFTEN"], smoking: ["NEVER", "SOMETIMES"], food: ["VEG", "NONVEG", "EGG"], exercise: ["NEVER", "SOMETIMES", "OFTEN"], pets: ["HAS", "WANTS", "NO"] };
const KEYS = ["energy", "planning", "sharing", "conflict", "pace", "texting", "ambition", "novelty", "family", "affection"];

function person(id: string): MatchPerson {
  const [city, lat, lng] = pick(CITIES);
  const lo = int(18, 40);
  return {
    id, gender: pick(GENDERS), age: int(18, 60), lat, lng, city, country: city === "London" ? "GB" : "IN", intent: pick(INTENTS),
    interests: INTS.filter(() => R() < 0.3),
    lifestyle: Object.fromEntries(Object.entries(LS).map(([k, v]) => [k, R() < 0.15 ? null : pick(v)])),
    answers: Object.fromEntries(KEYS.filter(() => R() < 0.85).map((k) => [k, int(1, 5)])),
    completeness: int(10, 100), verified: R() < 0.5,
    prefs: { interestedIn: GENDERS.filter(() => R() < 0.6), ageMin: lo, ageMax: int(lo, 70), maxDistanceKm: int(2, 500), intents: INTENTS.filter(() => R() < 0.2), longDistance: R() < 0.3 },
  };
}
const pairs = Array.from({ length: 120 }, (_, i) => [person(`a${i}`), person(`b${i}`)] as const);

describe("matching: scores stay in range and make sense", () => {
  pairs.slice(0, 100).forEach(([a, b], i) => it(`pair ${i + 1}: score is a number from 0 to 100 with reasons`, () => {
    const s = scorePair(a, b);
    expect(Number.isFinite(s.score)).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(s.reasons)).toBe(true);
    for (const v of Object.values(s.factors)) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  }));
  pairs.slice(0, 50).forEach(([a, b], i) => it(`pair ${i + 1}: the mutual score is the same both ways`, () => {
    expect(mutualScore(a, b).score).toBe(mutualScore(b, a).score);
  }));
  pairs.slice(50, 100).forEach(([a, b], i) => it(`pair ${i + 51}: eligibility is symmetric (both fit each other, or not)`, () => {
    expect(eligibility(a, b) === null).toBe(eligibility(b, a) === null);
  }));
  pairs.slice(0, 50).forEach(([a, b], i) => it(`pair ${i + 1}: the breakdown bars are 0–100`, () => {
    const c = compatibilityBreakdown(a, b);
    expect(c.overall).toBeGreaterThanOrEqual(0); expect(c.overall).toBeLessThanOrEqual(100);
    for (const bar of c.bars) { expect(bar.value).toBeGreaterThanOrEqual(0); expect(bar.value).toBeLessThanOrEqual(100); }
  }));
  pairs.slice(100, 120).forEach(([a], i) => it(`person ${i + 1}: nobody is shown to themselves`, () => {
    expect(eligibility(a, { ...a })).not.toBeNull();
  }));
});

describe("distance and age", () => {
  Array.from({ length: 50 }, () => R() * 2000).forEach((km, i) => it(`distance ${i + 1} (${km.toFixed(1)} km) is rounded, never exact`, () => {
    const l = distanceLabel(km);
    expect(l).toMatch(/^(Within (5|10) km|About \d+0 km away|\d+0\+ km away)$/);
  }));
  Array.from({ length: 30 }, () => [pick(CITIES), pick(CITIES)] as const).forEach(([[, a1, b1], [, a2, b2]], i) => it(`distance ${i + 1}: same both ways, zero to itself`, () => {
    expect(Math.abs(haversineKm(a1, b1, a2, b2) - haversineKm(a2, b2, a1, b1))).toBeLessThan(1e-9);
    expect(haversineKm(a1, b1, a1, b1)).toBeLessThan(1e-9);
  }));
  Array.from({ length: 50 }, () => { const y = int(1950, 2008), m = int(1, 12), d = int(1, 28); return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; })
    .forEach((dob, i) => it(`age ${i + 1}: born ${dob}`, () => {
      const today = new Date("2026-11-03T12:00:00Z");
      const [y, m, d] = dob.split("-").map(Number);
      const expected = 2026 - y - (11 < m || (m === 11 && 3 < d) ? 1 : 0);
      expect(ageFromDob(dob, today)).toBe(expected);
    }));
  it("someone born today 18 years ago is 18", () => expect(ageFromDob("2008-11-03", new Date("2026-11-03T00:00:00Z"))).toBe(18));
  it("…and the day before their 18th birthday they are 17", () => expect(ageFromDob("2008-11-04", new Date("2026-11-03T00:00:00Z"))).toBe(17));
  it("a 29 February birthday counts in a non-leap year", () => expect(ageFromDob("2000-02-29", new Date("2026-03-01T00:00:00Z"))).toBe(26));
});

describe("message screening", () => {
  const benign = ["Hey! How was your weekend?", "I loved the photo from Goa, was the water cold?", "Do you prefer chai or coffee?", "My sister says I make the best rajma.",
    "Shall we meet at the café near Khan Market on Saturday?", "I'm reading a book about the history of Delhi.", "That's hilarious 😂", "What kind of music do you like?",
    "I work in design, mostly apps.", "Haha yes, I have a dog named Mango.", "Ek din pakka chalenge trekking pe!", "I'm investing a lot of time in my guitar lessons",
    "Good morning! Hope your presentation goes well 🙂", "We should try that new dosa place", "I just got back from the gym", "Sunday plans: sleep in, then pancakes",
    "My favourite film is Dil Chahta Hai", "Do you like board games?", "I'm a bit nervous about first dates honestly", "Let's video call on Kinara first?"];
  const variants = (s: string) => [s, s.toLowerCase(), s + " 🙂", "Hi! " + s];
  benign.flatMap(variants).slice(0, 60).forEach((t, i) => it(`friendly message ${i + 1} isn't flagged as a scam or threat`, () => {
    const f = screenMessage(t);
    expect(f.filter((x) => ["SCAM", "THREAT", "ABUSE", "FINANCIAL_INFO", "RISKY_LINK"].includes(x))).toEqual([]);
  }));
  const bad: [string, string][] = [
    ["Send me money for my visa fee, I'm stuck at the airport", "SCAM"], ["Invest in my crypto platform, guaranteed profit", "SCAM"], ["Can you buy me a google play gift card", "SCAM"],
    ["Tell me the OTP you just received", "FINANCIAL_INFO"], ["What's your bank account number and CVV", "FINANCIAL_INFO"], ["Add me on whatsapp", "OFF_PLATFORM"],
    ["Message me on telegram instead", "OFF_PLATFORM"], ["Call me at +91 98765 43210", "CONTACT_INFO"], ["mail me at someone@example.com", "CONTACT_INFO"],
    ["I will find where you live and hurt you", "THREAT"], ["send nudes or I'll leak your photos", "THREAT"], ["check this http://192.168.0.1/login", "RISKY_LINK"],
  ];
  bad.flatMap(([t, f]) => [[t, f], [t.toUpperCase(), f], [`hey ${t.toLowerCase()} please`, f], [t.replace(/ /g, "  "), f]] as [string, string][])
    .forEach(([t, f], i) => it(`risky message ${i + 1} is flagged ${f}: "${t.slice(0, 40)}"`, () => { expect(screenMessage(t)).toContain(f); }));
});

describe("coupons never make a payment free or negative", () => {
  const buyer: Buyer = { gender: "MAN", country: "IN", everPaid: false, activeNow: false, introUsed: false, usedOfferIds: [], couponUses: {} };
  Array.from({ length: 60 }, (_, i) => {
    const kind = R() < 0.5 ? "PERCENT" : "FIXED";
    const c: CouponRow = { id: `c${i}`, code: `QA${i}`, kind, value: kind === "PERCENT" ? int(-20, 150) : int(0, 500000), currency: "INR", maxDiscountMinor: R() < 0.4 ? int(0, 100000) : null,
      minPurchaseMinor: R() < 0.3 ? int(0, 200000) : null, audience: "ALL", countries: "", plans: "", genders: "", usageLimit: null, perUserLimit: 1, usedCount: 0, startsAt: null, endsAt: null, active: true };
    return [c, int(100, 500000)] as const;
  }).forEach(([c, amount], i) => it(`coupon ${i + 1} (${c.kind} ${c.value}) on ₹${amount / 100}`, () => {
    const r = checkCoupon(c, { buyer, planCode: "PREMIUM", amountMinor: amount, currency: "INR", now: new Date(), genderCountries: ["IN"] });
    if (r.ok) { expect(r.discountMinor).toBeGreaterThan(0); expect(amount - r.discountMinor).toBeGreaterThanOrEqual(minimumCharge("INR")); }
  }));
  Array.from({ length: 20 }, () => [int(0, 10_000_000), pick(["INR", "USD", "GBP", "EUR", "JPY"])] as const).forEach(([m, cur], i) => it(`price ${i + 1}: ${m} ${cur} formats as money`, () => {
    const s = formatMoney(m, cur);
    expect(s).toMatch(/\d/);
    expect(s).not.toMatch(/NaN|undefined/);
  }));
});

describe("ad targeting", () => {
  const viewers = Array.from({ length: 40 }, () => ({ country: "IN", city: pick(["Delhi", "Noida", "Mumbai", "Pune"]), age: int(18, 70), gender: pick(GENDERS), interests: INTS.filter(() => R() < 0.3), device: pick(["ios", "android", "web"]), language: pick(["en", "hi"]), personalised: R() < 0.6 }));
  viewers.slice(0, 20).forEach((v, i) => it(`viewer ${i + 1}: an untargeted ad reaches every adult`, () => { expect(matchesTargeting(Targeting.parse({}), v)).toBe(true); }));
  viewers.forEach((v, i) => it(`viewer ${i + 1}: gender/interest targeting is never used without personalised ads`, () => {
    const t = Targeting.parse({ genders: [v.gender], interests: v.interests.length ? v.interests : ["coffee"] });
    const off = { ...v, personalised: false, gender: null, interests: [] };
    expect(matchesTargeting(t, off)).toBe(false);
  }));
  Array.from({ length: 20 }, (_, i) => `http://shop${i}.example.com/offer`).forEach((u, i) => it(`landing page ${i + 1} on plain http is refused`, () => { expect(checkUrl(u)).toMatch(/https/); }));
  Array.from({ length: 10 }, (_, i) => `https://shop${i}.example.in/p/${i}?utm_source=kinara`).forEach((u, i) => it(`landing page ${i + 1} on https is accepted`, () => { expect(checkUrl(u)).toBeNull(); }));
});

describe("colour themes stay readable", () => {
  for (const t of THEMES) for (const mode of ["light", "dark"] as const) {
    const p = t[mode];
    const pairs: [string, string, string, number][] = [
      ["body text on the page", p.text, p.bg, 7], ["body text on cards", p.text, p.surface, 7], ["secondary text on the page", p.muted, p.bg, 4.5],
      ["secondary text on cards", p.muted, p.surface, 4.5], ["faint text on the page", p.faint, p.bg, 3], ["button text on the brand colour", p.brandText, p.brand, 4.5],
      ["text on the accent colour", p.accentText, p.accent, 4.5],
    ];
    for (const [what, fg, bg, min] of pairs) it(`${t.name} (${mode}): ${what} meets ${min}:1`, () => { expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min); });
  }
});
