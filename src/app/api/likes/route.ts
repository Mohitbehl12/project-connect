import { countryRules } from "@/lib/compliance";
import { assertCanStartContact } from "@/lib/safety";
import { z } from "zod";
import { and, count, eq, gte, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { getConfig, planFeatures } from "@/lib/config";
import { scorePair } from "@/lib/matching";
import { rateLimit } from "@/lib/ratelimit";
import { blockedIds, isBlockedBetween, loadAnswers, loadPerson, publicCard, toMatchPerson } from "@/lib/people";
import { matchIfMutual } from "@/lib/matches";
import { photosFor } from "@/lib/photos";
import { notify } from "@/lib/notify";
import { screenMessage } from "@/lib/moderation";

const Body = z.object({
  toId: z.string().min(1).max(64),
  kind: z.enum(["LIKE", "PASS", "PRIORITY"]),
  note: z.string().trim().max(200).optional(),
});

function startOfUtcDay() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export const POST = route(async ({ req, user }) => {
  await rateLimit(`like:${user.id}`, 120, 60_000);
  const b = await parseBody(req, Body);
  if (b.toId === user.id) throw new ApiError(400, "You can't like your own profile.", "self");
  if (b.kind !== "PASS") assertCanStartContact(user);
  if (user.onboardingStep < 3) throw new ApiError(409, "Finish setting up your profile first.", "onboarding");

  const target = await db.query.users.findFirst({ where: eq(schema.users.id, b.toId) });
  if (!target || target.status !== "ACTIVE" || target.role !== "USER" || target.onboardingStep < 3 || target.deactivatedAt)
    throw new ApiError(404, "This profile isn't available anymore.", "not_found");
  if (await isBlockedBetween(user.id, b.toId)) throw new ApiError(404, "This profile isn't available anymore.", "not_found");

  if (b.kind !== "PASS" && user.selfieStatus !== "VERIFIED") {
    const mine = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id), columns: { country: true } });
    if ((await countryRules(mine?.country)).ageAssurance === "SELFIE_REQUIRED")
      throw new ApiError(403, "In your country, members complete the selfie check before liking anyone. It takes a minute in Safety.", "verification_required");
    const theirPrefs = await db.query.preferences.findFirst({ where: eq(schema.preferences.userId, b.toId) });
    if (theirPrefs?.likesFrom === "VERIFIED") throw new ApiError(403, "This person only connects with verified profiles. Verify your profile to like them.", "verified_only");
  }

  const already = await db.query.likes.findFirst({ where: and(eq(schema.likes.fromId, user.id), eq(schema.likes.toId, b.toId)) });
  if (already) throw new ApiError(409, "You've already responded to this profile.", "duplicate");

  if (b.kind !== "PASS") {
    const f = await planFeatures(user.planCode, user.planEndsAt);
    const [{ n }] = await db.select({ n: count() }).from(schema.likes)
      .where(and(eq(schema.likes.fromId, user.id), eq(schema.likes.kind, b.kind), gte(schema.likes.createdAt, startOfUtcDay())));
    const limit = b.kind === "PRIORITY" ? f.dailyPriorityLikes : f.dailyLikes;
    if (limit >= 0 && n >= limit)
      throw new ApiError(429, b.kind === "PRIORITY"
        ? "You've used today's priority likes. They refresh at midnight UTC."
        : "You've reached today's like limit. It resets at midnight UTC, or upgrade for more.", "daily_limit");
    if (b.note) {
      const flags = screenMessage(b.note);
      if (flags.some((x) => ["SCAM", "ABUSE", "CONTACT_INFO", "LINK", "OFF_PLATFORM"].includes(x)))
        throw new ApiError(422, "Keep your note friendly and leave out contact details or links.", "note_rejected");
    }
  }

  await db.insert(schema.likes).values({ fromId: user.id, toId: b.toId, kind: b.kind, note: b.kind === "PASS" ? null : b.note || null });
  if (b.kind === "PASS") return ok({ matched: false });

  const match = await matchIfMutual(user.id, b.toId);
  if (!match) {
    await notify(b.toId, "LIKE", b.kind === "PRIORITY" ? "Someone sent you a priority like" : "Someone likes you",
      "Open Likes to see who's interested.", "/likes");
  }
  return ok({ matched: !!match, matchId: match?.id ?? null });
});

/** People who liked me and whom I haven't responded to yet. */
export const GET = route(async ({ user }) => {
  const me = await loadPerson(user.id);
  if (!me) return ok({ total: 0, cards: [], hidden: 0, canSeeAll: false });
  const f = await planFeatures(user.planCode, user.planEndsAt);
  const acted = (await db.select({ id: schema.likes.toId }).from(schema.likes).where(eq(schema.likes.fromId, user.id))).map((x) => x.id);
  const blocked = [...(await blockedIds(user.id))];

  const incoming = await db.select().from(schema.likes)
    .where(and(eq(schema.likes.toId, user.id), inArray(schema.likes.kind, ["LIKE", "PRIORITY"]), notInArray(schema.likes.fromId, [...acted, ...blocked, user.id])));
  if (!incoming.length) return ok({ total: 0, cards: [], hidden: 0, canSeeAll: f.seeWhoLiked });

  const rows = await db.select({ user: schema.users, profile: schema.profiles, prefs: schema.preferences })
    .from(schema.users)
    .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
    .innerJoin(schema.preferences, eq(schema.preferences.userId, schema.users.id))
    .where(and(inArray(schema.users.id, incoming.map((l) => l.fromId)), eq(schema.users.status, "ACTIVE")));
  const answers = await loadAnswers(rows.map((r) => r.user.id));
  const weights = await getConfig("matching.weights");
  const byId = new Map(incoming.map((l) => [l.fromId, l]));

  // Priority likes always reveal who sent them; regular likes need the seeWhoLiked entitlement.
  const visible = rows.filter((r) => f.seeWhoLiked || byId.get(r.user.id)?.kind === "PRIORITY");
  const photoMap = await photosFor(visible.map((r) => r.user.id));
  // Locked (free plan) likes expose only a blurhash so the grid can show a soft placeholder — never the photo itself.
  const lockedRows = rows.filter((r) => !visible.includes(r));
  const lockedPhotos = await photosFor(lockedRows.map((r) => r.user.id));
  const locked = lockedRows.map((r) => ({ blurhash: lockedPhotos.get(r.user.id)?.[0]?.blurhash ?? null }));
  const cards = visible
    .map((r) => {
      const like = byId.get(r.user.id)!;
      const s = scorePair(me.person, toMatchPerson(r, answers.get(r.user.id) ?? {}), weights);
      return { ...publicCard(me.person, r, { score: s.score, reasons: s.reasons, photos: photoMap.get(r.user.id) }), likeKind: like.kind, likeNote: like.note, likedAt: like.createdAt };
    })
    .sort((a, b) => (a.likeKind === "PRIORITY" ? -1 : 0) - (b.likeKind === "PRIORITY" ? -1 : 0) || +b.likedAt - +a.likedAt);
  return ok({ total: rows.length, cards, hidden: rows.length - cards.length, locked, canSeeAll: f.seeWhoLiked });
});
