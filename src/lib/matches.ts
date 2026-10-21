import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError } from "./http";
import { getConfig } from "./config";
import { loadPerson } from "./people";
import { mutualScore } from "./matching";
import { notify } from "./notify";

/** Ordered pair so (a,b) and (b,a) map to the same unique row. */
export const orderedPair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/** Creates a match if both people have liked each other. Idempotent. */
export async function matchIfMutual(fromId: string, toId: string) {
  const back = await db.query.likes.findFirst({
    where: and(eq(schema.likes.fromId, toId), eq(schema.likes.toId, fromId), inArray(schema.likes.kind, ["LIKE", "PRIORITY"])),
  });
  if (!back) return null;
  const [userAId, userBId] = orderedPair(fromId, toId);
  const existing = await db.query.matches.findFirst({ where: and(eq(schema.matches.userAId, userAId), eq(schema.matches.userBId, userBId)) });
  if (existing) return existing;

  const [a, b] = await Promise.all([loadPerson(fromId), loadPerson(toId)]);
  if (!a || !b) return null;
  const weights = await getConfig("matching.weights");
  const s = mutualScore(a.person, b.person, weights);
  const [m] = await db.insert(schema.matches).values({ userAId, userBId, score: s.score, reasons: JSON.stringify(s.reasons) }).returning();

  await notify(fromId, "MATCH", `You matched with ${b.row.profile.firstName}`, "Say hello while it's fresh.", `/matches/${m.id}`);
  await notify(toId, "MATCH", `You matched with ${a.row.profile.firstName}`, "Say hello while it's fresh.", `/matches/${m.id}`);
  return m;
}

/** Loads a match and asserts the user is part of it and it is still active. */
export async function requireMatch(matchId: string, userId: string, { allowEnded = false } = {}) {
  const m = await db.query.matches.findFirst({
    where: and(eq(schema.matches.id, matchId), or(eq(schema.matches.userAId, userId), eq(schema.matches.userBId, userId))),
  });
  if (!m) throw new ApiError(404, "This conversation doesn't exist.", "not_found");
  if (m.status !== "ACTIVE" && !allowEnded) throw new ApiError(410, "This match has ended.", "match_ended");
  return { match: m, otherId: m.userAId === userId ? m.userBId : m.userAId };
}

/** True when `userId` has muted notifications for this chat. */
export async function isMuted(userId: string, matchId: string) {
  return !!(await db.query.chatMutes.findFirst({ where: and(eq(schema.chatMutes.userId, userId), eq(schema.chatMutes.matchId, matchId)) }));
}
