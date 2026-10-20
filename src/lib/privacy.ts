import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNotNull, lt, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "./audit";
import { ApiError } from "./http";
import { liveSubscription, paymentHistory, providerByName, subscriptionSummary, syncUserPlan } from "./billing";
import { getConfig } from "./config";
import { openSafe } from "./crypto";
import { storage } from "./storage";

const DAY = 86_400_000;

/**
 * "Download my data": everything we hold about the person, in one JSON document.
 * Other people's personal data is left out (we include matches by first name only, and only the
 * person's own messages in full), and so are internal fields such as password hashes and risk notes.
 */
export async function exportMyData(user: User) {
  const [profile, prefs, answers, photos, likesSent, matches, blocks, notifications, sessions, logins, refs] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) }),
    db.query.preferences.findFirst({ where: eq(schema.preferences.userId, user.id) }),
    db.select().from(schema.personalityAnswers).where(eq(schema.personalityAnswers.userId, user.id)),
    db.select({ id: schema.photos.id, position: schema.photos.position, createdAt: schema.photos.createdAt }).from(schema.photos).where(eq(schema.photos.userId, user.id)),
    db.select({ kind: schema.likes.kind, createdAt: schema.likes.createdAt }).from(schema.likes).where(eq(schema.likes.fromId, user.id)),
    db.select().from(schema.matches).where(or(eq(schema.matches.userAId, user.id), eq(schema.matches.userBId, user.id))),
    db.select({ createdAt: schema.blocks.createdAt }).from(schema.blocks).where(eq(schema.blocks.blockerId, user.id)),
    db.select({ type: schema.notifications.type, title: schema.notifications.title, createdAt: schema.notifications.createdAt }).from(schema.notifications).where(eq(schema.notifications.userId, user.id)),
    db.select({ deviceName: schema.sessions.deviceName, platform: schema.sessions.platform, createdAt: schema.sessions.createdAt, lastUsedAt: schema.sessions.lastUsedAt, revokedAt: schema.sessions.revokedAt }).from(schema.sessions).where(eq(schema.sessions.userId, user.id)),
    db.select({ success: schema.loginEvents.success, platform: schema.loginEvents.platform, createdAt: schema.loginEvents.createdAt }).from(schema.loginEvents).where(eq(schema.loginEvents.userId, user.id)),
    db.select({ status: schema.referrals.status, createdAt: schema.referrals.createdAt, rewardDays: schema.referrals.rewardDays }).from(schema.referrals).where(eq(schema.referrals.referrerId, user.id)),
  ]);
  const otherIds = matches.map((m) => (m.userAId === user.id ? m.userBId : m.userAId));
  const names = otherIds.length ? await db.select({ id: schema.profiles.userId, name: schema.profiles.firstName }).from(schema.profiles).where(inArray(schema.profiles.userId, otherIds)) : [];
  const myMessages = matches.length ? await db.select().from(schema.messages).where(and(inArray(schema.messages.matchId, matches.map((m) => m.id)), eq(schema.messages.senderId, user.id))) : [];
  const { lat: _lat, lng: _lng, ...profileOut } = profile ?? ({} as any);
  return {
    exportedAt: new Date().toISOString(),
    note: "Your Kinara data. Exact location coordinates are stored only to calculate distances and are not included here; your city is.",
    account: { email: user.email, phone: user.phone, dob: user.dob, createdAt: user.createdAt, emailVerified: user.emailVerified, phoneVerified: user.phoneVerified, selfieStatus: user.selfieStatus, referralCode: user.referralCode },
    profile: profile ? profileOut : null,
    preferences: prefs ?? null,
    personalityAnswers: answers.map((a) => ({ question: a.questionKey, value: a.value })),
    photos,
    likesSent,
    matches: matches.map((m) => ({ with: names.find((n) => n.id === (m.userAId === user.id ? m.userBId : m.userAId))?.name ?? "Deleted member", status: m.status, createdAt: m.createdAt })),
    messagesYouSent: myMessages.map((m) => ({ at: m.createdAt, text: m.deletedAt ? null : openSafe(m.body, m.matchId), deleted: !!m.deletedAt })),
    blockedCount: blocks.length,
    notifications,
    subscription: await subscriptionSummary(user.id),
    payments: await paymentHistory(user.id),
    devices: sessions,
    signIns: logins,
    referrals: refs,
  };
}

/** Deletes the person's own messages in one conversation (or all). The other person sees "Message deleted". */
export async function deleteMyMessages(user: User, matchId?: string) {
  const mine = await db.select({ id: schema.matches.id }).from(schema.matches).where(or(eq(schema.matches.userAId, user.id), eq(schema.matches.userBId, user.id)));
  const ids = mine.map((m) => m.id).filter((id) => !matchId || id === matchId);
  if (!ids.length) return 0;
  const rows = await db.update(schema.messages).set({ deletedAt: new Date() })
    .where(and(inArray(schema.messages.matchId, ids), eq(schema.messages.senderId, user.id), eq(schema.messages.kind, "TEXT"), ne(schema.messages.body, ""))).returning({ id: schema.messages.id });
  await audit(user.id, "privacy.delete_messages", "user", user.id, { matchId: matchId ?? "all", count: rows.length });
  return rows.length;
}

/**
 * Account deletion. Personal data is removed now; what the law makes us keep is kept, minimised:
 *  • payment records + invoices (tax law) stay, linked to an anonymised account;
 *  • deleted messages are kept for the configured safety window (reports/legal requests), then purged;
 *  • audit entries stay (they hold ids, not personal content).
 */
export async function deleteAccount(user: User) {
  const live = await liveSubscription(user.id);
  // App Store / Google Play subscriptions can only be cancelled by the member in the store.
  const storeNote = live && (live.provider === "APPLE" || live.provider === "GOOGLE") && !live.cancelAtPeriodEnd
    ? `Your ${live.provider === "APPLE" ? "App Store" : "Google Play"} subscription is not cancelled by deleting your account. Turn off auto-renew in your phone's subscription settings to stop being charged.`
    : null;
  if (live?.providerRef && live.kind === "RECURRING" && !live.cancelAtPeriodEnd && !storeNote) {
    // Never delete while a mandate might keep charging: stop it with the gateway first.
    try { await providerByName(live.provider)?.cancelAtCycleEnd(live.providerRef); }
    catch { throw new ApiError(503, "We couldn't stop your subscription with the bank just now, so we haven't deleted anything. Please try again in a few minutes.", "gateway_error"); }
  }

  const files = await db.select({ key: schema.photos.storageKey }).from(schema.photos).where(eq(schema.photos.userId, user.id));
  for (const f of files) await storage().delete(f.key).catch(() => {});
  await audit(user.id, "user.delete_account", "user", user.id, { photos: files.length });

  const hasPayments = (await db.select({ id: schema.payments.id }).from(schema.payments).where(eq(schema.payments.userId, user.id)).limit(1)).length > 0;
  if (!hasPayments) {
    await db.delete(schema.users).where(eq(schema.users.id, user.id)); // cascades everything
    return { deleted: true, kept: [] as string[], storeNote };
  }

  await deleteMyMessages(user);
  const uid = user.id;
  await Promise.all([
    db.delete(schema.photos).where(eq(schema.photos.userId, uid)),
    db.delete(schema.profiles).where(eq(schema.profiles.userId, uid)),
    db.delete(schema.preferences).where(eq(schema.preferences.userId, uid)),
    db.delete(schema.personalityAnswers).where(eq(schema.personalityAnswers.userId, uid)),
    db.delete(schema.likes).where(or(eq(schema.likes.fromId, uid), eq(schema.likes.toId, uid))),
    db.delete(schema.notifications).where(eq(schema.notifications.userId, uid)),
    db.delete(schema.devices).where(eq(schema.devices.userId, uid)),
    db.delete(schema.otpCodes).where(eq(schema.otpCodes.userId, uid)),
    db.delete(schema.sessions).where(eq(schema.sessions.userId, uid)),
    db.update(schema.matches).set({ status: "UNMATCHED", unmatchedBy: uid }).where(or(eq(schema.matches.userAId, uid), eq(schema.matches.userBId, uid))),
    db.update(schema.subscriptions).set({ status: "EXPIRED", endsAt: new Date(), cancelAtPeriodEnd: true }).where(and(eq(schema.subscriptions.userId, uid), ne(schema.subscriptions.status, "EXPIRED"))),
  ]);
  await db.update(schema.users).set({
    email: `deleted+${uid}@deleted.invalid`, phone: null, dob: null, passwordHash: "!" + randomBytes(24).toString("hex"),
    status: "DELETED", deletedAt: new Date(), tokenVersion: user.tokenVersion + 1, referralCode: null, totpSecret: null, totpPending: null,
    signupIp: null, signupInstallId: null, planCode: "FREE", planEndsAt: null,
  }).where(eq(schema.users.id, uid));
  await syncUserPlan(uid);
  return { deleted: true, kept: ["Payment records and invoices (required for tax)", "Deleted messages for a limited safety-review period"], storeNote };
}

/** Scheduled clean-up of data we no longer have a reason to keep. */
export async function runRetention(now = new Date()) {
  const msgDays = await getConfig("retention.deletedMessageDays");
  const loginDays = await getConfig("retention.loginEventDays");
  const purged = await db.update(schema.messages).set({ body: "" })
    .where(and(isNotNull(schema.messages.deletedAt), lt(schema.messages.deletedAt, new Date(now.getTime() - msgDays * DAY)), ne(schema.messages.body, ""))).returning({ id: schema.messages.id });
  const logins = await db.delete(schema.loginEvents).where(lt(schema.loginEvents.createdAt, new Date(now.getTime() - loginDays * DAY))).returning({ id: schema.loginEvents.id });
  const sessions = await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date(now.getTime() - 30 * DAY))).returning({ id: schema.sessions.id });
  return { messagesPurged: purged.length, loginEventsDeleted: logins.length, sessionsDeleted: sessions.length };
}
