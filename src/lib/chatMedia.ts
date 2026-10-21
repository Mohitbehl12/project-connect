import "server-only";
import { logAutomatedDecision } from "./safety";
import { randomUUID } from "node:crypto";
import { and, count, eq, gte, inArray, isNotNull, isNull, ne, notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "./audit";
import { getConfig } from "./config";
import { seal } from "./crypto";
import { ApiError } from "./http";
import { requireMatch, isMuted } from "./matches";
import { notify } from "./notify";
import { isBlockedBetween } from "./people";
import { screenPhoto } from "./photoScreen";
import { processPhoto } from "./photos";
import { bumpChat } from "./realtime";
import { storage } from "./storage";

// Photos and voice messages in chat.
// - Unlocked only once both people have sent a text message (no unsolicited pictures from strangers).
// - Photos: re-encoded on the server, which drops all EXIF data including GPS location. Explicit
//   photos are refused automatically when a scanner is set up. Received photos are always blurred until
//   the person taps to view.
// - Voice: up to 60 seconds, the formats phones and browsers record.
// - Files are deleted when the match ends or the message is deleted.

export const MAX_VOICE_MS = 60_000;
const MAX_VOICE_BYTES = 1_500_000;

export type MediaMeta = { w?: number; h?: number; blurhash?: string; checked?: boolean; ms?: number; type?: string };

async function unlocked(matchId: string, me: string, other: string) {
  const need = await getConfig("chat.mediaAfterMessagesEach");
  if (need <= 0) return true;
  const rows = await db.select({ s: schema.messages.senderId, n: count() }).from(schema.messages)
    .where(and(eq(schema.messages.matchId, matchId), eq(schema.messages.kind, "TEXT"), isNull(schema.messages.deletedAt))).groupBy(schema.messages.senderId);
  const n = (id: string) => rows.find((r) => r.s === id)?.n ?? 0;
  return n(me) >= need && n(other) >= need;
}

async function prepare(user: User, matchId: string) {
  const { match, otherId } = await requireMatch(matchId, user.id);
  if (await isBlockedBetween(user.id, otherId)) throw new ApiError(410, "This match has ended.", "match_ended");
  if (!(await unlocked(match.id, user.id, otherId))) throw new ApiError(403, "Photos and voice messages unlock once you've both sent a message.", "media_locked");
  return { match, otherId };
}

async function deliver(user: User, matchId: string, otherId: string, kind: "PHOTO" | "VOICE", key: string, meta: MediaMeta, preview: string) {
  const [msg] = await db.insert(schema.messages).values({ matchId, senderId: user.id, kind, body: seal(preview, matchId), mediaKey: key, mediaMeta: JSON.stringify(meta) }).returning();
  if (!(await isMuted(otherId, matchId))) await notify(otherId, "MESSAGE", "New message", kind === "PHOTO" ? "You received a photo." : "You received a voice message.", `/matches/${matchId}`);
  bumpChat(matchId);
  return msg;
}

export async function sendPhoto(user: User, matchId: string, input: Buffer) {
  const { match, otherId } = await prepare(user, matchId);
  const p = await processPhoto(input); // re-encodes (EXIF/GPS removed), checks format and size
  const check = await screenPhoto(p.data);
  if (check.status === "REJECTED") {
    await audit(user.id, "chat.photo_rejected", "match", match.id, { reason: check.reason });
    await logAutomatedDecision({ userId: user.id, kind: "PHOTO_SCREEN", decision: "NOT_SENT", reason: "A chat photo was stopped because automated screening found it explicit. You can appeal if this is wrong.", system: "photo-screen" });
    throw new ApiError(422, "This photo can't be sent because it looks explicit. See our Community Guidelines.", "photo_rejected");
  }
  const key = `chat/${match.id}/${randomUUID()}.webp`;
  await storage().put(key, p.data, "image/webp");
  return deliver(user, match.id, otherId, "PHOTO", key, { w: p.width, h: p.height, blurhash: p.blurhash, checked: check.status === "LIVE" }, "📷 Photo");
}

/** Recognises the audio formats phones and browsers record, from the file's first bytes. */
export function audioType(b: Buffer): { ext: string; type: string } | null {
  if (b.length < 12) return null;
  if (b.readUInt32BE(0) === 0x1a45dfa3) return { ext: "webm", type: "audio/webm" };
  if (b.toString("latin1", 4, 8) === "ftyp") return { ext: "m4a", type: "audio/mp4" };
  if (b.toString("latin1", 0, 4) === "OggS") return { ext: "ogg", type: "audio/ogg" };
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return { ext: "aac", type: "audio/aac" };
  return null;
}

export async function sendVoice(user: User, matchId: string, input: Buffer, ms: number) {
  const { match, otherId } = await prepare(user, matchId);
  if (input.length > MAX_VOICE_BYTES) throw new ApiError(413, "That voice message is too long. Keep it under a minute.", "too_large");
  const t = audioType(input);
  if (!t) throw new ApiError(422, "That recording couldn't be read. Try recording again.", "bad_audio");
  const length = Math.round(Math.min(Math.max(ms || 0, 500), MAX_VOICE_MS));
  const key = `chat/${match.id}/${randomUUID()}.${t.ext}`;
  await storage().put(key, input, t.type);
  return deliver(user, match.id, otherId, "VOICE", key, { ms: length, type: t.type }, "🎤 Voice message");
}

/** Media fields for the messages list (signed links valid for an hour). */
export async function mediaFor(m: { kind: string; mediaKey: string | null; mediaMeta: string | null; deletedAt: Date | null }) {
  if ((m.kind !== "PHOTO" && m.kind !== "VOICE") || !m.mediaKey || m.deletedAt) return null;
  const meta = (m.mediaMeta ? JSON.parse(m.mediaMeta) : {}) as MediaMeta;
  return { url: await storage().url(m.mediaKey, 3600), ...meta };
}

/** Deletes a message's file (when its sender deletes the message). */
export async function dropMedia(messageId: string) {
  const m = await db.query.messages.findFirst({ where: eq(schema.messages.id, messageId) });
  if (!m?.mediaKey) return;
  await storage().delete(m.mediaKey).catch(() => {});
  await db.update(schema.messages).set({ mediaKey: null }).where(eq(schema.messages.id, m.id));
}

/** Deletes photos and voice messages from conversations that have ended. Run after unmatching and on a schedule. */
export async function purgeEndedChatMedia(matchIds?: string[]) {
  // Reported conversations keep their media as evidence for 90 days (as the Privacy Policy says for messages).
  const since = new Date(Date.now() - 90 * 86_400_000);
  const held = (await db.select({ m: schema.reports.matchId }).from(schema.reports).where(and(isNotNull(schema.reports.matchId), gte(schema.reports.createdAt, since)))).map((r) => r.m!);
  const rows = await db.select({ id: schema.messages.id, key: schema.messages.mediaKey }).from(schema.messages)
    .innerJoin(schema.matches, eq(schema.matches.id, schema.messages.matchId))
    .where(and(isNotNull(schema.messages.mediaKey), ne(schema.matches.status, "ACTIVE"),
      matchIds?.length ? inArray(schema.matches.id, matchIds) : undefined, held.length ? notInArray(schema.matches.id, held) : undefined)).limit(2000);
  for (const r of rows) await storage().delete(r.key!).catch(() => {});
  if (rows.length) await db.update(schema.messages).set({ mediaKey: null }).where(inArray(schema.messages.id, rows.map((r) => r.id)));
  return rows.length;
}

/** Hearts: toggles this person's heart on a message in one of their conversations. */
export async function react(user: User, messageId: string, on: boolean) {
  const m = await db.query.messages.findFirst({ where: eq(schema.messages.id, messageId) });
  if (!m || m.deletedAt || m.kind === "SYSTEM") throw new ApiError(404, "Message not found.", "not_found");
  await requireMatch(m.matchId, user.id); // must be part of an active conversation
  if (on) await db.insert(schema.messageReactions).values({ messageId, userId: user.id }).onConflictDoNothing();
  else await db.delete(schema.messageReactions).where(and(eq(schema.messageReactions.messageId, messageId), eq(schema.messageReactions.userId, user.id)));
  bumpChat(m.matchId);
  return { liked: on };
}
