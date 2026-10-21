import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull, lt, ne, notInArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "./audit";
import { ApiError } from "./http";
import { liveSubscription, paymentHistory, providerByName, subscriptionSummary, syncUserPlan } from "./billing";
import { getConfig } from "./config";
import { openSafe } from "./crypto";
import { storage } from "./storage";
import { notify } from "./notify";
import { heldUserIds } from "./safety";

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
  // Evidence must survive: if someone reported this account, or it's under a legal hold, we anonymise instead
  // of hard-deleting, so reported chats stay available for review until their retention period ends.
  const reportedAgainst = (await db.select({ id: schema.reports.id }).from(schema.reports).where(eq(schema.reports.reportedId, user.id)).limit(1)).length > 0;
  const held = (await heldUserIds()).has(user.id);
  if (!hasPayments && !reportedAgainst && !held) {
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
    db.update(schema.matches).set({ status: "UNMATCHED", unmatchedBy: uid, endedAt: new Date() }).where(or(eq(schema.matches.userAId, uid), eq(schema.matches.userBId, uid))),
    db.update(schema.subscriptions).set({ status: "EXPIRED", endsAt: new Date(), cancelAtPeriodEnd: true }).where(and(eq(schema.subscriptions.userId, uid), ne(schema.subscriptions.status, "EXPIRED"))),
  ]);
  await db.update(schema.users).set({
    email: `deleted+${uid}@deleted.invalid`, phone: null, dob: null, passwordHash: "!" + randomBytes(24).toString("hex"),
    status: "DELETED", deletedAt: new Date(), tokenVersion: user.tokenVersion + 1, referralCode: null, totpSecret: null, totpPending: null,
    signupIp: null, signupInstallId: null, planCode: "FREE", planEndsAt: null,
  }).where(eq(schema.users.id, uid));
  await syncUserPlan(uid);
  const kept = [
    ...(hasPayments ? ["Payment records and invoices (required for tax)"] : []),
    "Deleted messages for a limited safety-review period",
    ...(reportedAgainst || held ? ["Messages in reported chats, as evidence, until the case and its retention period end"] : []),
  ];
  return { deleted: true, kept, storeNote };
}

/**
 * Scheduled clean-up (daily, from the cron job). Each category has its own period, set in Admin → Settings
 * and listed in the Privacy Policy (docs/RETENTION.md). Accounts on a legal hold are skipped.
 */
export async function runRetention(now = new Date()) {
  const days = async (k: Parameters<typeof getConfig>[0]) => Number(await getConfig(k));
  const ago = (d: number) => new Date(now.getTime() - d * DAY);
  const held = [...(await heldUserIds())];
  const out: Record<string, number> = {};

  // 1. Deleted messages: text removed after the safety window.
  // Reported chats are kept longer as evidence (step 2 handles them).
  const reported = new Set((await db.select({ m: schema.reports.matchId }).from(schema.reports).where(isNotNull(schema.reports.matchId))).map((r) => r.m!));
  out.deletedMessagesPurged = (await db.update(schema.messages).set({ body: "" })
    .where(and(isNotNull(schema.messages.deletedAt), lt(schema.messages.deletedAt, ago(await days("retention.deletedMessageDays"))), ne(schema.messages.body, ""),
      reported.size ? notInArray(schema.messages.matchId, [...reported]) : undefined, held.length ? notInArray(schema.messages.senderId, held) : undefined)).returning({ id: schema.messages.id })).length;

  // 2. Ended chats: messages deleted after N days; reported chats are kept longer as evidence.
  const ended = await db.select({ id: schema.matches.id, a: schema.matches.userAId, b: schema.matches.userBId, endedAt: schema.matches.endedAt }).from(schema.matches)
    .where(and(eq(schema.matches.status, "UNMATCHED"), isNotNull(schema.matches.endedAt), lt(schema.matches.endedAt, ago(await days("retention.endedChatDays")))));
  const reportedCut = ago(await days("retention.reportedChatDays"));
  const purge = ended.filter((m) => !held.includes(m.a) && !held.includes(m.b) && (!reported.has(m.id) || m.endedAt! < reportedCut)).map((m) => m.id);
  out.endedChatMessagesDeleted = 0;
  for (let i = 0; i < purge.length; i += 200) {
    const ids = purge.slice(i, i + 200);
    out.endedChatMessagesDeleted += (await db.delete(schema.messages).where(inArray(schema.messages.matchId, ids)).returning({ id: schema.messages.id })).length;
  }

  // 3. Security logs, call records, call requests, notifications.
  const notHeld = (col: typeof schema.loginEvents.userId) => (held.length ? or(isNull(col), notInArray(col, held)) : undefined);
  out.loginEventsDeleted = (await db.delete(schema.loginEvents).where(and(lt(schema.loginEvents.createdAt, ago(await days("retention.loginEventDays"))), notHeld(schema.loginEvents.userId))).returning({ id: schema.loginEvents.id })).length;
  out.sessionsDeleted = (await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, ago(30))).returning({ id: schema.sessions.id })).length;
  const callCut = ago(await days("retention.callMetadataDays"));
  out.callRecordsDeleted = (await db.delete(schema.calls).where(and(lt(schema.calls.createdAt, callCut), held.length ? and(notInArray(schema.calls.callerId, held), notInArray(schema.calls.calleeId, held)) : undefined)).returning({ id: schema.calls.id })).length;
  out.callRequestsDeleted = (await db.delete(schema.callRequests).where(and(lt(schema.callRequests.createdAt, ago(await days("retention.callRequestDays"))), held.length ? and(notInArray(schema.callRequests.fromId, held), notInArray(schema.callRequests.toId, held)) : undefined)).returning({ id: schema.callRequests.id })).length;
  out.notificationsDeleted = (await db.delete(schema.notifications).where(lt(schema.notifications.createdAt, ago(await days("retention.notificationDays")))).returning({ id: schema.notifications.id })).length;

  // 4. Short-lived secrets.
  out.otpCodesDeleted = (await db.delete(schema.otpCodes).where(lt(schema.otpCodes.createdAt, ago(1))).returning({ id: schema.otpCodes.id })).length;
  out.passwordResetsDeleted = (await db.delete(schema.passwordResets).where(lt(schema.passwordResets.createdAt, ago(1))).returning({ id: schema.passwordResets.id })).length;

  // 5. Safety records: resolved risk signals and old automated decisions go; closed reports lose their free text.
  out.riskSignalsDeleted = (await db.delete(schema.riskSignals).where(and(isNotNull(schema.riskSignals.resolvedAt), lt(schema.riskSignals.resolvedAt, ago(await days("retention.resolvedRiskSignalDays"))))).returning({ id: schema.riskSignals.id })).length;
  out.automatedDecisionsDeleted = (await db.delete(schema.automatedDecisions).where(and(lt(schema.automatedDecisions.createdAt, ago(await days("retention.automatedDecisionDays"))), held.length ? notInArray(schema.automatedDecisions.userId, held) : undefined)).returning({ id: schema.automatedDecisions.id })).length;
  out.closedReportsMinimised = (await db.update(schema.reports).set({ details: "", resolution: "(removed under retention policy)" })
    .where(and(ne(schema.reports.status, "OPEN"), isNotNull(schema.reports.resolvedAt), lt(schema.reports.resolvedAt, ago(await days("retention.closedReportDays"))), ne(schema.reports.details, ""), held.length ? notInArray(schema.reports.reportedId, held) : undefined))
    .returning({ id: schema.reports.id })).length;

  // 6. Audit trail older than the audit period (the chain stays verifiable from the oldest kept row).
  out.auditLogsDeleted = (await db.delete(schema.auditLogs).where(lt(schema.auditLogs.createdAt, ago(await days("retention.auditLogDays")))).returning({ id: schema.auditLogs.id })).length;

  // 7. Inactive accounts (off unless configured): warn once, delete 30 days after the warning.
  out.inactiveWarned = 0; out.inactiveDeleted = 0;
  const months = await days("retention.inactiveAccountMonths");
  if (months > 0) {
    const idle = await db.select().from(schema.users).where(and(eq(schema.users.role, "USER"), ne(schema.users.status, "DELETED"), lt(schema.users.lastActiveAt, ago(months * 30))));
    for (const u of idle.filter((x) => !held.includes(x.id))) {
      const warned = await db.query.auditLogs.findFirst({ where: and(eq(schema.auditLogs.action, "retention.inactive_warned"), eq(schema.auditLogs.entityId, u.id), gte(schema.auditLogs.createdAt, u.lastActiveAt)) });
      if (!warned) {
        await notify(u.id, "SECURITY", "Your account will be deleted soon", `You haven't used Kinara for ${months} months. Sign in within 30 days to keep your account; otherwise we'll delete it and your data.`);
        await audit(null, "retention.inactive_warned", "user", u.id);
        out.inactiveWarned++;
      } else if (warned.createdAt < ago(30)) {
        await deleteAccount(u).catch(() => null);
        await audit(null, "retention.inactive_deleted", "user", u.id);
        out.inactiveDeleted++;
      }
    }
  }
  return out;
}

/** The retention schedule as shown to members (deletion screen) and staff. */
export async function retentionSchedule() {
  const g = async (k: Parameters<typeof getConfig>[0]) => Number(await getConfig(k));
  const months = await g("retention.inactiveAccountMonths");
  return [
    { what: "Profile, photos, preferences, likes and matches", keep: "Until you delete your account (deleted straight away)" },
    { what: "Messages in chats that have ended", keep: `${await g("retention.endedChatDays")} days after the chat ends` },
    { what: "Messages you deleted", keep: `${await g("retention.deletedMessageDays")} days (for safety reports), then removed` },
    { what: "Chats that were reported", keep: `Up to ${await g("retention.reportedChatDays")} days after the chat ends, as evidence` },
    { what: "Photos and voice messages in chats", keep: "Deleted when the chat ends, unless the chat was reported" },
    { what: "Selfie for the verification check", keep: "Deleted once a decision is made; we keep only the result" },
    { what: "Call records (who, when, how long — calls are never recorded)", keep: `${await g("retention.callMetadataDays")} days` },
    { what: "Call requests", keep: `${await g("retention.callRequestDays")} days` },
    { what: "Notifications", keep: `${await g("retention.notificationDays")} days` },
    { what: "Sign-in history", keep: `${await g("retention.loginEventDays")} days` },
    { what: "Reports about you or by you", keep: `Details removed ${await g("retention.closedReportDays")} days after the report is closed` },
    { what: "Automated safety decisions about you", keep: `${await g("retention.automatedDecisionDays")} days` },
    { what: "Security and staff audit log", keep: `${await g("retention.auditLogDays")} days` },
    { what: "Payment records and invoices", keep: "8 years, because tax and accounting law requires it (no card numbers — the payment provider holds those)" },
    { what: "Database backups", keep: "Up to 30 days, then overwritten" },
    { what: "Inactive accounts", keep: months > 0 ? `Deleted after ${months} months without use (we warn you 30 days before)` : "Kept until you delete them" },
    { what: "Anything under a legal hold (a serious safety case or a lawful request)", keep: "Until the hold ends" },
  ];
}
