import { and, eq, gte, inArray, isNull, lte, ne, notInArray, or } from "drizzle-orm";
import { CITIES } from "@/lib/constants";
import { db, schema } from "@/db";
import { ApiError, ok, route } from "@/lib/http";
import { getConfig } from "@/lib/config";
import { blockedIds, loadAnswers, loadPerson, publicCard, toMatchPerson } from "@/lib/people";
import { alignedTraits, eligibility, scorePair } from "@/lib/matching";
import { photosFor } from "@/lib/photos";

const MODES = ["recommended", "nearby", "compatibility", "interests", "intent", "new"] as const;
type Mode = (typeof MODES)[number];

function dobBound(yearsAgo: number) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - yearsAgo);
  return d.toISOString().slice(0, 10);
}

export const GET = route(async ({ req, user }) => {
  const url = new URL(req.url);
  const mode = (MODES.includes(url.searchParams.get("mode") as Mode) ? url.searchParams.get("mode") : "recommended") as Mode;
  // Explore filters: one interest, verified people only.
  const interest = url.searchParams.get("interest");
  const verifiedOnly = url.searchParams.get("verified") === "1";
  if (user.onboardingStep < 3) throw new ApiError(409, "Finish setting up your profile to start discovering people.", "onboarding");

  const me = await loadPerson(user.id);
  if (!me) throw new ApiError(409, "Finish setting up your profile to start discovering people.", "onboarding");
  const viewer = me.person;

  const [acted, blocked, weights, batch] = await Promise.all([
    db.select({ id: schema.likes.toId }).from(schema.likes).where(eq(schema.likes.fromId, user.id)),
    blockedIds(user.id),
    getConfig("matching.weights"),
    getConfig("discovery.batchSize"),
  ]);
  const exclude = [user.id, ...acted.map((a) => a.id), ...blocked];

  // Coarse SQL pre-filter (gender, age band, country, active, onboarded); fine filters run in the engine.
  // Scale-up path: Postgres + PostGIS ST_DWithin on a geography column, plus a precomputed candidate table.
  const where = [
    eq(schema.users.status, "ACTIVE"),
    eq(schema.users.role, "USER"),
    eq(schema.users.onboardingStep, 3),
    inArray(schema.profiles.gender, viewer.prefs.interestedIn.length ? viewer.prefs.interestedIn : ["__none__"]),
    lte(schema.profiles.dob, dobBound(viewer.prefs.ageMin)),
    gte(schema.profiles.dob, dobBound(viewer.prefs.ageMax + 1)),
    notInArray(schema.users.id, exclude),
    eq(schema.preferences.discoverable, true),
    isNull(schema.users.deactivatedAt), // paused profiles are hidden
    isNull(schema.users.restrictedAt), // high-risk accounts under review are not shown to anyone
    ...(verifiedOnly ? [eq(schema.users.selfieStatus, "VERIFIED")] : []),
    ...(mode === "new" ? [gte(schema.users.createdAt, new Date(Date.now() - 14 * 86_400_000))] : []),
  ];
  // Same country — or visiting a city in it with travel mode.
  if (!viewer.prefs.longDistance) {
    const cities = Object.entries(CITIES).filter(([, c]) => c.country === viewer.country).map(([k]) => k);
    where.push(or(eq(schema.profiles.country, viewer.country), and(inArray(schema.preferences.travelCity, cities.length ? cities : ["__none__"]), gte(schema.preferences.travelUntil, new Date())))!);
  }

  const rows = await db
    .select({ user: schema.users, profile: schema.profiles, prefs: schema.preferences })
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

  const answers = await loadAnswers(rows.map((r) => r.user.id));
  let scored = rows
    .filter((r) => !r.prefs?.incognito || likedMe.has(r.user.id))
    // "Only verified people can like me": hidden from unverified viewers rather than shown and refused.
    .filter((r) => r.prefs?.likesFrom !== "VERIFIED" || user.selfieStatus === "VERIFIED")
    // "Who can see my profile: verified members only".
    .filter((r) => r.prefs?.profileVisibility !== "VERIFIED" || user.selfieStatus === "VERIFIED")
    .filter((r) => !interest || r.profile.interests.split(",").includes(interest))
    .map((r) => ({ r, person: toMatchPerson(r, answers.get(r.user.id) ?? {}) }))
    .filter((x) => eligibility(viewer, x.person) === null)
    .map((x) => ({ ...x, s: scorePair(viewer, x.person, weights) }));

  const recentBoost = (d: Date) => (Date.now() - d.getTime() < 3 * 86400_000 ? 2 : 0);
  switch (mode) {
    case "nearby":
      scored.sort((a, b) => a.s.distanceKm - b.s.distanceKm);
      break;
    case "compatibility":
      scored.sort((a, b) => b.s.factors.personality + b.s.factors.lifestyle - (a.s.factors.personality + a.s.factors.lifestyle));
      break;
    case "interests":
      scored = scored.filter((x) => x.s.factors.interests > 0.3);
      scored.sort((a, b) => b.s.factors.interests - a.s.factors.interests || b.s.score - a.s.score);
      break;
    case "new":
      scored.sort((a, b) => b.r.user.createdAt.getTime() - a.r.user.createdAt.getTime());
      break;
    case "intent":
      scored = scored.filter((x) => x.person.intent === viewer.intent);
      scored.sort((a, b) => b.s.score - a.s.score);
      break;
    default:
      // Boosted profiles (a reward or a boost) get a fixed lift; compatibility still dominates.
      const lift = (u: { lastActiveAt: Date; boostUntil: Date | null }) => recentBoost(u.lastActiveAt) + (u.boostUntil && u.boostUntil.getTime() > Date.now() ? 8 : 0);
      scored.sort((a, b) => b.s.score + lift(b.r.user) - (a.s.score + lift(a.r.user)));
  }

  const page = scored.slice(0, batch);
  const photoMap = await photosFor(page.map((x) => x.r.user.id));
  const cards = page.map((x) => ({
    ...publicCard(viewer, x.r, { score: x.s.score, reasons: x.s.reasons, photos: photoMap.get(x.r.user.id) }),
    // One personality line for the card front (only traits both people share; never raw answers).
    trait: alignedTraits(viewer, x.person, 1)[0] ?? null,
  }));
  return ok({ mode, cards, totalAvailable: scored.length });
});
