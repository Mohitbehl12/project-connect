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

/**
 * Messages are delivered by short polling (client calls with ?after=<iso>).
 * Upgrade path: Supabase Realtime / Socket.io / Pusher publishing from POST below — same payload shape.
 */
export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const { match, otherId } = await requireMatch(params.id, user.id, { allowEnded: true });
  const after = new URL(req.url).searchParams.get("after");
  const afterDate = after ? new Date(after) : null;

  const rows = await db.select().from(schema.messages)
    .where(and(eq(schema.messages.matchId, match.id), afterDate && !isNaN(+afterDate) ? gt(schema.messages.createdAt, afterDate) : undefined))
    .orderBy(asc(schema.messages.createdAt)).limit(500);

  // Mark incoming as read.
  await db.update(schema.messages).set({ readAt: new Date() })
    .where(and(eq(schema.messages.matchId, match.id), ne(schema.messages.senderId, user.id), isNull(schema.messages.readAt)));
  await db.update(schema.users).set({ lastActiveAt: new Date() }).where(eq(schema.users.id, user.id));

  const otherPrefs = await db.query.preferences.findFirst({ where: eq(schema.preferences.userId, otherId) });
  const showReceipts = otherPrefs?.readReceipts !== false;

  return ok({
    ended: match.status !== "ACTIVE",
    messages: rows.map((m) => {
      const mine = m.senderId === user.id;
      const flags = (m.flags ? m.flags.split(",") : []) as Flag[];
      return {
        id: m.id,
        mine,
        kind: m.kind,
        body: m.deletedAt ? null : m.body,
        deleted: !!m.deletedAt,
        createdAt: m.createdAt,
        read: mine && showReceipts ? !!m.readAt : undefined,
        warning: !mine && !m.deletedAt ? warningFor(flags) : null,
      };
    }),
  });
}, { allowSuspended: true });

const Body = z.object({ body: z.string().trim().min(1, "Write a message first").max(2000) });

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  rateLimit(`msg:${user.id}`, 30, 60_000);
  const { match, otherId } = await requireMatch(params.id, user.id);
  if (await isBlockedBetween(user.id, otherId)) throw new ApiError(410, "This match has ended.", "match_ended");
  const { body } = await parseBody(req, Body);

  // Controlled interaction: cap how many messages can go unanswered in a row.
  const limit = await getConfig("chat.maxUnansweredMessages");
  const recent = await db.select({ senderId: schema.messages.senderId }).from(schema.messages)
    .where(and(eq(schema.messages.matchId, match.id), eq(schema.messages.kind, "TEXT"), isNull(schema.messages.deletedAt)))
    .orderBy(desc(schema.messages.createdAt)).limit(limit);
  if (recent.length >= limit && recent.every((r) => r.senderId === user.id))
    throw new ApiError(429, `You've sent ${limit} messages in a row. Give them a chance to reply.`, "awaiting_reply");

  const flags = screenMessage(body);
  const [msg] = await db.insert(schema.messages).values({ matchId: match.id, senderId: user.id, body, flags: flags.join(",") }).returning();

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
  return ok({ id: msg.id, createdAt: msg.createdAt, flagged: flags.length > 0 }, 201);
});
