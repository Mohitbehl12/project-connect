import "server-only";
import { and, count, eq, gte, inArray, isNull, lte, ne, notInArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { getConfig } from "./config";
import { CITIES, EXPLORE_CATEGORIES, INTENTS, INTERESTS, LANGUAGES, LIFESTYLE } from "./constants";
import { ApiError } from "./http";
import { alignedTraits, ageFromDob, eligibility, scorePair } from "./matching";
import { blockedIds, loadAnswers, loadPerson, publicCard, toMatchPerson } from "./people";
import { photosFor } from "./photos";

// The discovery engine shared by Discover, Explore collections and search. Everyone returned has passed the
// same privacy and safety rules (blocks, incognito, "verified only", paused or restricted accounts, the
// viewer's preferences). Filters only ever narrow that set.

export const MODES = ["recommended", "nearby", "compatibility", "interests", "intent", "new", "trending", "popular", "around", "lifestyle"] as const;
export type Mode = (typeof MODES)[number];

export type Filters = {
  q?: string; // free text over profession, education, bio, interests and city — never names
  interests?: string[]; // anyone with at least one
  city?: string;
  ageMin?: number; ageMax?: number;
  intents?: string[];
  lifestyle?: Record<string, string[]>; // e.g. { food: ["VEG"], drinking: ["NEVER", "SOCIAL"] }
  languages?: string[];
  education?: string; profession?: string;
  verified?: boolean;
};

function dobBound(yearsAgo: number) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - yearsAgo);
  return d.toISOString().slice(0, 10);
}
const csv = (s: string | null | undefined) => (s ? s.split(",").filter(Boolean) : []);
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Parses search filters from a URL (unknown values are dropped, never errors). */
export function filtersFrom(sp: URLSearchParams): Filters {
  const list = (k: string, allowed: Record<string, string> | readonly string[]) => {
    const ok = Array.isArray(allowed) ? allowed : Object.keys(allowed);
    return csv(sp.get(k)).filter((x) => ok.includes(x)).slice(0, 20);
  };
  const num = (k: string) => { const n = Number(sp.get(k)); return Number.isFinite(n) && n >= 18 && n <= 99 ? Math.round(n) : undefined; };
  const lifestyle: Record<string, string[]> = {};
  for (const [k, opts] of Object.entries(LIFESTYLE)) { const v = list(k, opts as Record<string, string>); if (v.length) lifestyle[k] = v; }
  const text = (k: string) => (sp.get(k) ?? "").trim().slice(0, 60) || undefined;
  const one = sp.get("interest");
  return {
    q: text("q"), interests: [...list("interests", INTERESTS), ...(one && INTERESTS[one] ? [one] : [])], city: CITIES[sp.get("city") ?? ""] ? sp.get("city")! : undefined,
    ageMin: num("ageMin"), ageMax: num("ageMax"), intents: list("intents", INTENTS), lifestyle, languages: list("languages", LANGUAGES),
    education: text("education"), profession: text("profession"), verified: sp.get("verified") === "1",
  };
}

/** Everyone the viewer may see, scored. */
async function candidates(user: User, f: Filters) {
  if (user.onboardingStep < 3) throw new ApiError(409, "Finish setting up your profile to start discovering people.", "onboarding");
  const me = await loadPerson(user.id);
  if (!me) throw new ApiError(409, "Finish setting up your profile to start discovering people.", "onboarding");
  const viewer = me.person;
  const [acted, blocked, weights] = await Promise.all([
    db.select({ id: schema.likes.toId }).from(schema.likes).where(eq(schema.likes.fromId, user.id)),
    blockedIds(user.id),
    getConfig("matching.weights"),
  ]);
  const exclude = [user.id, ...acted.map((a) => a.id), ...blocked];
  // Search can only narrow the viewer's own age preferences, never widen them.
  const ageMin = Math.max(viewer.prefs.ageMin, f.ageMin ?? 18), ageMax = Math.min(viewer.prefs.ageMax, f.ageMax ?? 99);
  const where = [
    eq(schema.users.status, "ACTIVE"),
    eq(schema.users.role, "USER"),
    eq(schema.users.onboardingStep, 3),
    inArray(schema.profiles.gender, viewer.prefs.interestedIn.length ? viewer.prefs.interestedIn : ["__none__"]),
    lte(schema.profiles.dob, dobBound(ageMin)),
    gte(schema.profiles.dob, dobBound(ageMax + 1)),
    notInArray(schema.users.id, exclude),
    eq(schema.preferences.discoverable, true),
    isNull(schema.users.deactivatedAt), // paused profiles are hidden
    isNull(schema.users.restrictedAt), // high-risk accounts under review are not shown to anyone
    ...(f.verified ? [eq(schema.users.selfieStatus, "VERIFIED")] : []),
  ];
  if (!viewer.prefs.longDistance) {
    const cities = Object.entries(CITIES).filter(([, c]) => c.country === viewer.country).map(([k]) => k);
    where.push(or(eq(schema.profiles.country, viewer.country), and(inArray(schema.preferences.travelCity, cities.length ? cities : ["__none__"]), gte(schema.preferences.travelUntil, new Date())))!);
  }
  const rows = await db.select({ user: schema.users, profile: schema.profiles, prefs: schema.preferences })
    .from(schema.users)
    .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
    .innerJoin(schema.preferences, eq(schema.preferences.userId, schema.users.id))
    .where(and(...where))
    .limit(1000);
  // Incognito people are only shown to people they have already liked.
  const incognitoIds = rows.filter((r) => r.prefs?.incognito).map((r) => r.user.id);
  const likedMe = incognitoIds.length
    ? new Set((await db.select({ id: schema.likes.fromId }).from(schema.likes)
        .where(and(eq(schema.likes.toId, user.id), inArray(schema.likes.fromId, incognitoIds), ne(schema.likes.kind, "PASS")))).map((x) => x.id))
    : new Set<string>();
  const q = f.q ? norm(f.q) : "";
  const answers = await loadAnswers(rows.map((r) => r.user.id));
  const scored = rows
    .filter((r) => !r.prefs?.incognito || likedMe.has(r.user.id))
    .filter((r) => r.prefs?.likesFrom !== "VERIFIED" || user.selfieStatus === "VERIFIED")
    .filter((r) => r.prefs?.profileVisibility !== "VERIFIED" || user.selfieStatus === "VERIFIED")
    .filter((r) => {
      const p = r.profile;
      const ints = csv(p.interests);
      if (f.interests?.length && !f.interests.some((i) => ints.includes(i))) return false;
      // A hidden city can't be searched for.
      if (f.city && (p.city !== f.city || r.prefs?.showCity === false)) return false;
      if (f.intents?.length && !f.intents.includes(p.intent)) return false;
      for (const [k, vals] of Object.entries(f.lifestyle ?? {})) if (!vals.includes(String((p as Record<string, unknown>)[k] ?? ""))) return false;
      if (f.languages?.length && !f.languages.some((l) => csv(p.languages).includes(l))) return false;
      if (f.education && !norm(p.education ?? "").includes(norm(f.education))) return false;
      if (f.profession && !norm(p.profession ?? "").includes(norm(f.profession))) return false;
      if (q) {
        const hay = norm([p.profession, p.education, p.bio, p.city, ...ints.map((i) => INTERESTS[i] ?? i), INTENTS[p.intent as keyof typeof INTENTS]].filter(Boolean).join(" "));
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      const age = ageFromDob(p.dob);
      return age >= ageMin && age <= ageMax;
    })
    .map((r) => ({ r, person: toMatchPerson(r, answers.get(r.user.id) ?? {}) }))
    .filter((x) => eligibility(viewer, x.person) === null)
    .map((x) => ({ ...x, s: scorePair(viewer, x.person, weights) }));
  return { viewer, scored };
}
type Scored = Awaited<ReturnType<typeof candidates>>["scored"][number];

/** Likes (not passes) each candidate received recently — used for order only, never shown. */
async function attention(ids: string[], days: number) {
  if (!ids.length) return new Map<string, number>();
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db.select({ id: schema.likes.toId, n: count() }).from(schema.likes)
    .where(and(inArray(schema.likes.toId, ids.slice(0, 1000)), ne(schema.likes.kind, "PASS"), gte(schema.likes.createdAt, since))).groupBy(schema.likes.toId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

const recentBoost = (d: Date) => (Date.now() - d.getTime() < 3 * 86400_000 ? 2 : 0);
const lift = (u: { lastActiveAt: Date; boostUntil: Date | null }) => recentBoost(u.lastActiveAt) + (u.boostUntil && u.boostUntil.getTime() > Date.now() ? 8 : 0);
const NEW_DAYS = 14;

async function applyMode(mode: Mode, scored: Scored[], viewer: { interests: string[]; intent: string }) {
  const viewerInterests = viewer.interests;
  let list = scored;
  switch (mode) {
    case "nearby": return [...list].sort((a, b) => a.s.distanceKm - b.s.distanceKm);
    case "compatibility": return [...list].sort((a, b) => b.s.factors.personality + b.s.factors.lifestyle - (a.s.factors.personality + a.s.factors.lifestyle));
    case "interests":
      list = list.filter((x) => x.s.factors.interests > 0.3);
      return list.sort((a, b) => b.s.factors.interests - a.s.factors.interests || b.s.score - a.s.score);
    case "around": {
      // At least one shared interest, but not already a strong overlap ("Your Interests" covers those).
      const mine = new Set(viewerInterests);
      list = list.filter((x) => x.person.interests.some((i) => mine.has(i)) && x.s.factors.interests <= 0.3);
      return list.sort((a, b) => b.s.score - a.s.score);
    }
    case "lifestyle":
      list = list.filter((x) => x.s.factors.lifestyle >= 0.6);
      return list.sort((a, b) => b.s.factors.lifestyle - a.s.factors.lifestyle || b.s.score - a.s.score);
    case "new":
      list = list.filter((x) => Date.now() - x.r.user.createdAt.getTime() < NEW_DAYS * 86400_000);
      return list.sort((a, b) => b.r.user.createdAt.getTime() - a.r.user.createdAt.getTime());
    case "intent":
      return list.filter((x) => x.person.intent === viewer.intent).sort((a, b) => b.s.score - a.s.score);
    case "trending":
    case "popular": {
      const att = await attention(list.map((x) => x.r.user.id), mode === "trending" ? 7 : 30);
      list = list.filter((x) => (att.get(x.r.user.id) ?? 0) >= (mode === "trending" ? 1 : 2));
      // Attention first, but compatibility still counts, so it isn't a pure popularity contest.
      return list.sort((a, b) => Math.log2(1 + (att.get(b.r.user.id) ?? 0)) * 10 + b.s.score - (Math.log2(1 + (att.get(a.r.user.id) ?? 0)) * 10 + a.s.score));
    }
    default:
      return [...list].sort((a, b) => b.s.score + lift(b.r.user) - (a.s.score + lift(a.r.user)));
  }
}

/** Plain-language chemistry label. It is an estimate from answers and preferences, never a certainty. */
export function chemistryLabel(score: number | undefined) {
  if (score === undefined) return null;
  return score >= 85 ? "✨ Strong Chemistry" : score >= 70 ? "❤️ Great Match" : score >= 55 ? "Good Match" : null;
}

async function toCards(viewer: Awaited<ReturnType<typeof candidates>>["viewer"], page: Scored[]) {
  const photoMap = await photosFor(page.map((x) => x.r.user.id));
  return page.map((x) => ({
    ...publicCard(viewer, x.r, { score: x.s.score, reasons: x.s.reasons, photos: photoMap.get(x.r.user.id) }),
    chemistry: chemistryLabel(x.s.score),
    trait: alignedTraits(viewer, x.person, 1)[0] ?? null,
  }));
}

/** Discover, a collection or a search. `cat` is an Explore collection key. */
export async function discover(user: User, opts: { mode?: Mode; cat?: string; filters?: Filters; limit?: number }) {
  const cat = EXPLORE_CATEGORIES.find((c) => c.key === opts.cat);
  const f: Filters = { ...(opts.filters ?? {}) };
  if (cat && "interests" in cat) f.interests = [...(f.interests ?? []), ...cat.interests];
  const mode: Mode = cat && "rule" in cat ? (cat.rule as Mode) : opts.mode ?? "recommended";
  const { viewer, scored } = await candidates(user, f);
  const sorted = await applyMode(mode, scored, viewer);
  const limit = opts.limit ?? (await getConfig("discovery.batchSize"));
  return { mode, cards: await toCards(viewer, sorted.slice(0, limit)), totalAvailable: sorted.length };
}

/** Explore home: collection sizes, the viewer's interests with sizes, and a "Made For You" row. */
export async function exploreHome(user: User) {
  const { viewer, scored } = await candidates(user, {});
  const counts: Record<string, number> = {};
  for (const c of EXPLORE_CATEGORIES) {
    if ("interests" in c) counts[c.key] = scored.filter((x) => x.person.interests.some((i) => (c.interests as readonly string[]).includes(i))).length;
    else counts[c.key] = (await applyMode(c.rule as Mode, scored, viewer)).length;
  }
  const interests = viewer.interests.map((k) => ({ key: k, label: INTERESTS[k] ?? k, count: scored.filter((x) => x.person.interests.includes(k)).length }));
  const forYou = await toCards(viewer, (await applyMode("recommended", scored, viewer)).slice(0, 10));
  return {
    total: scored.length,
    categories: EXPLORE_CATEGORIES.map((c) => ({ key: c.key, title: c.title, sub: c.sub, emoji: c.emoji, count: counts[c.key], label: peopleLabel(counts[c.key]) })),
    interests: interests.map((i) => ({ ...i, label2: peopleLabel(i.count) })),
    forYou,
  };
}

/** "12K people", "340 people", "8 people" — real numbers, rounded when large. */
export function peopleLabel(n: number) {
  if (n <= 0) return "Be among the first";
  if (n === 1) return "1 person";
  if (n < 1000) return `${n} people`;
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}K people`;
}
