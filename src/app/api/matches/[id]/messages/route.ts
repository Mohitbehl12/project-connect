import { messageFlagCheck } from "@/lib/fraud";
import { openSafe, seal } from "@/lib/crypto";
import { z } from "zod";
import { and, asc, desc, eq, gt, gte, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { requireMatch } from "@/lib/matches";
import { isBlockedBetween } from "@/lib/people";
import { getConfig } from "@/lib/config";
import { rateLimit } from "@/lib/ratelimit";
import { REPORTABLE_FLAGS, screenMessage, warningFor, type Flag } from "@/lib/moderation";
import { notify } from "@/lib/notify";
import { bumpChat, setTyping } from "@/lib/realtime";
import { mediaFor } from "@/lib/chatMedia";
import { count, inArray } from "drizzle-orm";

/**
 * Messages. The app learns about changes instantly through /wait (long polling, lib/realtime) and then
 * fetches here; GET also marks incoming messages as read.
 */
export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const { match, otherId } = await requireMatch(params.id, user.id, { allowEnded: true });
  const after = new URL(req.url).searchParams.get("after");
  const afterDate = after ? new Date(after) : null;

  const rows = await db.select().from(schema.messages)
    .where(and(eq(schema.messages.matchId, match.id), afterDate && !isNaN(+afterDate) ? gt(schema.messages.createdAt, afterDate) : undefined))
    .orderBy(asc(schema.messages.createdAt)).limit(500);

  // Mark incoming as read (and tell the sender's open chat, for read receipts).
  const read = await db.update(schema.messages).set({ readAt: new Date() })
    .where(and(eq(schema.messages.matchId, match.id), ne(schema.messages.senderId, user.id), isNull(schema.messages.readAt))).returning({ id: schema.messages.id });
  if (read.length) bumpChat(match.id);
  await db.update(schema.users).set({ lastActiveAt: new Date() }).where(eq(schema.users.id, user.id));

  const otherPrefs = await db.query.preferences.findFirst({ where: eq(schema.preferences.userId, otherId) });
  const showReceipts = otherPrefs?.readReceipts !== false;
  const hearts = rows.length ? await db.select().from(schema.messageReactions).where(inArray(schema.messageReactions.messageId, rows.map((r) => r.id))) : [];
  const need = await getConfig("chat.mediaAfterMessagesEach");
  const sent = await db.select({ s: schema.messages.senderId, n: count() }).from(schema.messages)
    .where(and(eq(schema.messages.matchId, match.id), eq(schema.messages.kind, "TEXT"), isNull(schema.messages.deletedAt))).groupBy(schema.messages.senderId);
  const n = (id: string) => sent.find((r) => r.s === id)?.n ?? 0;
  const media = await Promise.all(rows.map((m) => mediaFor(m)));

  return ok({
    ended: match.status !== "ACTIVE",
    mediaUnlocked: match.status === "ACTIVE" && (need <= 0 || (n(user.id) >= need && n(otherId) >= need)),
    messages: rows.map((m, i) => {
      const mine = m.senderId === user.id;
      const flags = (m.flags ? m.flags.split(",") : []) as Flag[];
      return {
        id: m.id,
        mine,
        kind: m.kind,
        body: m.deletedAt ? null : openSafe(m.body, m.matchId),
        deleted: !!m.deletedAt,
        createdAt: m.createdAt,
        read: mine && showReceipts ? !!m.readAt : undefined,
        warning: !mine && !m.deletedAt ? warningFor(flags) : null,
        media: media[i],
        hearts: { mine: hearts.some((h) => h.messageId === m.id && h.userId === user.id), theirs: hearts.some((h) => h.messageId === m.id && h.userId !== user.id) },
      };
    }),
  });
}, { allowSuspended: true });

const Body = z.object({ body: z.string().trim().min(1, "Write a message first").max(2000), confirmed: z.boolean().optional() });

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  await rateLimit(`msg:${user.id}`, 30, 60_000);
  const { match, otherId } = await requireMatch(params.id, user.id);
  if (await isBlockedBetween(user.id, otherId)) throw new ApiError(410, "This match has ended.", "match_ended");
  const { body, confirmed } = await parseBody(req, Body);

  // Controlled interaction: cap how many messages can go unanswered in a row.
  const limit = await getConfig("chat.maxUnansweredMessages");
  const recent = await db.select({ senderId: schema.messages.senderId }).from(schema.messages)
    .where(and(eq(schema.messages.matchId, match.id), eq(schema.messages.kind, "TEXT"), isNull(schema.messages.deletedAt)))
    .orderBy(desc(schema.messages.createdAt)).limit(limit);
  if (recent.length >= limit && recent.every((r) => r.senderId === user.id))
    throw new ApiError(429, `You've sent ${limit} messages in a row. Give them a chance to reply.`, "awaiting_reply");

  const flags = screenMessage(body);
  // Kindness check: a nudge before sending something that may hurt. Sending anyway is allowed (and still screened).
  if (flags.includes("ABUSE") && !confirmed && (await getConfig("chat.kindnessCheck")))
    throw new ApiError(409, "This might come across as hurtful. Do you want to change it before sending?", "kindness_check");
  const [msg] = await db.insert(schema.messages).values({ matchId: match.id, senderId: user.id, body: seal(body, match.id), flags: flags.join(",") }).returning();

  if (flags.length) await messageFlagCheck(user.id);
  const reportable = flags.filter((f) => REPORTABLE_FLAGS.includes(f));
  if (reportable.length) {
    // One open automated report per sender per category per day to avoid flooding the queue.
    const since = new Date(Date.now() - 86400_000);
    const category = reportable.includes("SCAM") ? "SCAM" : "HARASSMENT";
    const dup = await db.query.reports.findFirst({
      where: and(eq(schema.reports.reportedId, user.id), eq(schema.reports.automated, true), eq(schema.reports.category, category), gte(schema.reports.createdAt, since)),
    });
    if (!dup)
      await db.insert(schema.reports).values({
        reportedId: user.id, matchId: match.id, messageId: msg.id, category, automated: true, priority: "HIGH",
        details: `Automated screening flagged a message: ${reportable.join(", ")}`,
      });
  }

  await notify(otherId, "MESSAGE", "New message", "You have a new message.", `/matches/${match.id}`);
  setTyping(match.id, user.id, false, false); // cleared together with the message, so the other side wakes once and sees both
  bumpChat(match.id);
  return ok({ id: msg.id, createdAt: msg.createdAt, flagged: flags.length > 0 }, 201);
});
