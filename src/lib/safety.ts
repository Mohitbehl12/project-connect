import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { ApiError } from "./http";
import { notify } from "./notify";
import { REPORT_PRIORITY, type ReportCategory } from "./constants";

// Case numbers people can quote to support: KN-R-2026-7KX2QF (reports), KN-A-… (appeals). No internal ids.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function caseNo(kind: "R" | "A") {
  const b = randomBytes(6);
  return `KN-${kind}-${new Date().getUTCFullYear()}-${[...b].map((x) => ALPHABET[x % 32]).join("")}`;
}

/** Report filed by our own screening (no reporter). */
export async function fileAutomatedReport(r: { reportedId: string; category: ReportCategory; details: string; matchId?: string | null; messageId?: string | null }) {
  const since = new Date(Date.now() - 86400_000);
  const dup = await db.query.reports.findFirst({
    where: and(eq(schema.reports.reportedId, r.reportedId), eq(schema.reports.automated, true), eq(schema.reports.category, r.category), gte(schema.reports.createdAt, since)),
  });
  if (dup) return dup; // one open automated report per person per category per day
  const [row] = await db.insert(schema.reports).values({
    caseNo: caseNo("R"), reportedId: r.reportedId, matchId: r.matchId ?? null, messageId: r.messageId ?? null, category: r.category,
    automated: true, priority: REPORT_PRIORITY[r.category] === "CRITICAL" ? "CRITICAL" : "HIGH", details: r.details,
  }).returning();
  return row;
}

/**
 * Log an automated decision that affects someone, so a person can review it and the member can appeal.
 * `reason` is plain language and never contains guesses about protected characteristics.
 */
export async function logAutomatedDecision(d: { userId: string; kind: string; decision: string; reason: string; system: string; refId?: string | null }) {
  const [row] = await db.insert(schema.automatedDecisions).values({ ...d, refId: d.refId ?? null }).returning();
  return row;
}

/**
 * Restriction (risk-based, never a ban): the person can keep chatting with existing matches, but can't
 * like, request calls or start new conversations, and is hidden from Discover, until they pass the selfie
 * check or a person reviews the account. They are told why and how to appeal.
 */
export async function restrictAccount(userId: string, reason: string, system: string) {
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!u || u.restrictedAt || u.role !== "USER") return false;
  await db.update(schema.users).set({ restrictedAt: new Date() }).where(eq(schema.users.id, userId));
  const dec = await logAutomatedDecision({ userId, kind: "RESTRICTION", decision: "RESTRICTED", reason, system });
  await audit(null, "safety.restrict", "user", userId, { reason, decision: dec.id });
  await notify(userId, "MODERATION", "Some features are paused",
    "For everyone's safety we've paused new likes, call requests and new conversations on your account until you complete the selfie check or our team reviews it. Your existing chats still work. If you think this is a mistake, you can appeal from Safety.", "/safety");
  return true;
}

export async function liftRestriction(userId: string, actorId: string | null, why: string) {
  const r = await db.update(schema.users).set({ restrictedAt: null }).where(and(eq(schema.users.id, userId), isNotNull(schema.users.restrictedAt))).returning({ id: schema.users.id });
  if (r.length) await audit(actorId, "safety.unrestrict", "user", userId, { why });
  return r.length > 0;
}

/** Throws a clear error if this account may not start new contact right now. */
export function assertCanStartContact(user: { restrictedAt: Date | null; deactivatedAt?: Date | null }) {
  if (user.deactivatedAt) throw new ApiError(409, "Your profile is paused. Turn it back on in Privacy Center to meet new people.", "paused");
  if (user.restrictedAt)
    throw new ApiError(403, "New likes, call requests and new conversations are paused on your account until you complete the selfie check or our team reviews it. You can appeal from Safety.", "restricted");
}

/** The other person has paused their profile. */
export async function assertNotPaused(otherId: string) {
  const o = await db.query.users.findFirst({ where: eq(schema.users.id, otherId), columns: { deactivatedAt: true } });
  if (o?.deactivatedAt) throw new ApiError(409, "This person has paused their profile for now.", "other_paused");
}

/** Accounts under a legal hold are skipped by retention purges. */
export async function heldUserIds(): Promise<Set<string>> {
  const now = new Date();
  const rows = await db.select({ u: schema.legalHolds.userId, until: schema.legalHolds.until }).from(schema.legalHolds).where(isNull(schema.legalHolds.releasedAt));
  return new Set(rows.filter((r) => !r.until || r.until > now).map((r) => r.u));
}
