import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { seal } from "@/lib/crypto";
import { getConfig } from "@/lib/config";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { isMuted, requireMatch } from "@/lib/matches";
import { notify } from "@/lib/notify";
import { isBlockedBetween } from "@/lib/people";
import { rateLimit } from "@/lib/ratelimit";
import { bumpChat } from "@/lib/realtime";
import { assertCanStartContact, assertNotPaused } from "@/lib/safety";

const FLIRTS = { WINK: { emoji: "😉", verb: "a wink 😉" }, HEART: { emoji: "❤️", verb: "a heart ❤️" } } as const;

/**
 * A wink or a heart in a chat: a playful one-tap message with its own animation. Only between matches,
 * and capped so nobody can send a stream of them without a reply.
 */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  await rateLimit(`flirt:${user.id}`, 20, 60 * 60_000);
  const { kind } = await parseBody(req, z.object({ kind: z.enum(["WINK", "HEART"]) }));
  const { match, otherId } = await requireMatch(params.id, user.id);
  if (await isBlockedBetween(user.id, otherId)) throw new ApiError(410, "This match has ended.", "match_ended");
  await assertNotPaused(otherId);

  const recent = await db.select({ senderId: schema.messages.senderId, kind: schema.messages.kind }).from(schema.messages)
    .where(and(eq(schema.messages.matchId, match.id), isNull(schema.messages.deletedAt))).orderBy(desc(schema.messages.createdAt)).limit(20);
  if (!recent.some((m) => m.senderId === user.id)) assertCanStartContact(user);
  const cap = await getConfig("flirt.maxUnansweredFlirts");
  let run = 0;
  for (const m of recent) { if (m.senderId !== user.id) break; if (m.kind === "WINK" || m.kind === "HEART") run++; }
  if (run >= cap) throw new ApiError(429, "Let them reply before sending more winks or hearts.", "awaiting_reply");

  const f = FLIRTS[kind];
  const [msg] = await db.insert(schema.messages).values({ matchId: match.id, senderId: user.id, kind, body: seal(f.emoji, match.id) }).returning();
  if (!(await isMuted(otherId, match.id))) {
    const me = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id), columns: { firstName: true } });
    await notify(otherId, "MESSAGE", `${me?.firstName ?? "Your match"} sent you ${f.verb}`, kind === "WINK" ? "Send a wink back? 😉" : "Someone's thinking of you 💕", `/matches/${match.id}`);
  }
  bumpChat(match.id);
  return ok({ id: msg.id, kind, createdAt: msg.createdAt }, 201);
});
