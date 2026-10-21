import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MatchPerson } from "./matching";
import { ageFromDob, distanceLabel, haversineKm } from "./matching";
import { CITIES, COUNTRIES, GENDERS, INTENTS, INTEREST_EMOJI, INTERESTS, LANGUAGES, LIFESTYLE, type LifestyleKey } from "./constants";

type Row = { user: typeof schema.users.$inferSelect; profile: typeof schema.profiles.$inferSelect; prefs: typeof schema.preferences.$inferSelect | null };

const csv = (s: string | null | undefined) => (s ? s.split(",").filter(Boolean) : []);

export async function loadAnswers(userIds: string[]): Promise<Map<string, Record<string, number>>> {
  const map = new Map<string, Record<string, number>>();
  if (!userIds.length) return map;
  // chunk to keep SQL parameter count reasonable
  for (let i = 0; i < userIds.length; i += 400) {
    const rows = await db.select().from(schema.personalityAnswers).where(inArray(schema.personalityAnswers.userId, userIds.slice(i, i + 400)));
    for (const r of rows) {
      const m = map.get(r.userId) ?? {};
      m[r.questionKey] = r.value;
      map.set(r.userId, m);
    }
  }
  return map;
}

/** Where someone is for matching: their own city, or the city they're visiting with travel mode. */
export function effectiveLocation(r: Row) {
  const t = r.prefs?.travelCity;
  if (t && CITIES[t] && r.prefs?.travelUntil && r.prefs.travelUntil.getTime() > Date.now())
    return { city: t, country: CITIES[t].country, lat: CITIES[t].lat, lng: CITIES[t].lng, visiting: true };
  return { city: r.profile.city, country: r.profile.country, lat: r.profile.lat, lng: r.profile.lng, visiting: false };
}

export function toMatchPerson(r: Row, answers: Record<string, number>): MatchPerson {
  const p = { ...r.profile, ...effectiveLocation(r) };
  return {
    id: r.user.id,
    gender: p.gender,
    age: ageFromDob(p.dob),
    lat: p.lat,
    lng: p.lng,
    city: p.city,
    country: p.country,
    intent: p.intent,
    interests: csv(p.interests),
    lifestyle: { drinking: p.drinking, smoking: p.smoking, food: p.food, exercise: p.exercise, pets: p.pets },
    answers,
    completeness: p.completeness,
    verified: r.user.selfieStatus === "VERIFIED",
    prefs: {
      interestedIn: csv(r.prefs?.interestedIn),
      ageMin: r.prefs?.ageMin ?? 18,
      ageMax: r.prefs?.ageMax ?? 99,
      maxDistanceKm: r.prefs?.maxDistanceKm ?? 50,
      intents: csv(r.prefs?.intents),
      longDistance: r.prefs?.longDistance ?? false,
    },
  };
}

export async function loadPerson(userId: string): Promise<{ row: Row; person: MatchPerson } | null> {
  const [row] = await db
    .select({ user: schema.users, profile: schema.profiles, prefs: schema.preferences })
    .from(schema.users)
    .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
    .leftJoin(schema.preferences, eq(schema.preferences.userId, schema.users.id))
    .where(eq(schema.users.id, userId));
  if (!row) return null;
  const answers = await loadAnswers([userId]);
  return { row, person: toMatchPerson(row, answers.get(userId) ?? {}) };
}

/**
 * All user IDs hidden from `userId` because of a block in either direction — plus, against the simplest
 * way round a block, other accounts created from the same app install as someone this person blocked.
 */
export async function blockedIds(userId: string): Promise<Set<string>> {
  const rows = await db.select().from(schema.blocks)
    .where(or(eq(schema.blocks.blockerId, userId), eq(schema.blocks.blockedId, userId)));
  const out = new Set(rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));
  const iBlocked = rows.filter((b) => b.blockerId === userId).map((b) => b.blockedId);
  if (iBlocked.length) {
    const installs = (await db.select({ i: schema.users.signupInstallId }).from(schema.users).where(inArray(schema.users.id, iBlocked)))
      .map((x) => x.i).filter((x): x is string => !!x);
    if (installs.length) {
      const twins = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.signupInstallId, installs));
      for (const t of twins) if (t.id !== userId) out.add(t.id);
    }
  }
  return out;
}

export async function isBlockedBetween(a: string, b: string) {
  const row = await db.query.blocks.findFirst({
    where: or(and(eq(schema.blocks.blockerId, a), eq(schema.blocks.blockedId, b)), and(eq(schema.blocks.blockerId, b), eq(schema.blocks.blockedId, a))),
  });
  return !!row;
}

/**
 * The ONLY shape of another user's profile that leaves the server.
 * No email, phone, coordinates, DOB, internal flags or plan data.
 */
type CardPhoto = { id: string; url: string; blurhash: string; width: number; height: number };

export function publicCard(viewer: MatchPerson, r: Row, extra: { score?: number; reasons?: string[]; photos?: CardPhoto[]; matched?: boolean } = {}) {
  const loc = effectiveLocation(r);
  const p = { ...r.profile, ...loc };
  const km = haversineKm(viewer.lat, viewer.lng, p.lat, p.lng);
  const lifestyle = (Object.keys(LIFESTYLE) as LifestyleKey[])
    .map((k) => (p[k] ? (LIFESTYLE[k] as Record<string, string>)[p[k] as string] : null))
    .filter(Boolean) as string[];
  let prompts: { q: string; a: string }[] = [];
  try { prompts = JSON.parse(p.prompts); } catch { /* ignore */ }
  const theirInterests = csv(p.interests);
  const viewerInterests = new Set(viewer.interests);
  return {
    id: r.user.id,
    firstName: p.firstName,
    age: ageFromDob(p.dob),
    gender: GENDERS[p.gender as keyof typeof GENDERS] ?? p.gender,
    // People can hide their city (then only the country shows) and their distance. Never coordinates.
    city: r.prefs?.showCity === false ? (COUNTRIES[p.country]?.name ?? p.country) : loc.visiting ? `Visiting ${p.city}` : p.city,
    distance: r.prefs?.showDistance === false ? "Distance hidden" : distanceLabel(km, viewer.city === p.city && r.prefs?.showCity !== false),
    bio: p.bio,
    intent: INTENTS[p.intent as keyof typeof INTENTS] ?? p.intent,
    profession: p.profession,
    education: p.education,
    heightCm: p.heightCm,
    lifestyle,
    interests: theirInterests.map((k) => INTERESTS[k] ?? k),
    interestKeys: theirInterests,
    languages: csv(p.languages).map((k) => LANGUAGES[k] ?? k),
    // Shared interests first; emoji are decorative and come from a fixed list.
    shared: theirInterests.filter((k) => viewerInterests.has(k)).map((k) => ({ key: k, label: INTERESTS[k] ?? k, emoji: INTEREST_EMOJI[k] ?? "" })),
    prompts,
    // "Who can see my photos: matches only" → others see the first photo (enough to decide), matches see all.
    photos: r.prefs?.photosVisibility === "MATCHES" && !extra.matched ? (extra.photos ?? []).slice(0, 1) : extra.photos ?? [],
    morePhotosForMatches: r.prefs?.photosVisibility === "MATCHES" && !extra.matched && (extra.photos?.length ?? 0) > 1,
    verified: r.user.selfieStatus === "VERIFIED",
    score: extra.score,
    reasons: extra.reasons,
  };
}
export type PublicCard = ReturnType<typeof publicCard>;
