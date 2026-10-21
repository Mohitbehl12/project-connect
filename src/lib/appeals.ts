import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { ApiError } from "./http";
import { notify } from "./notify";
import { caseNo, liftRestriction } from "./safety";

export const APPEAL_KINDS = {
  SUSPENSION: "My account was suspended",
  BAN: "My account was banned",
  RESTRICTION: "Features on my account were paused",
  REPORT_OUTCOME: "A decision about a report I made or received",
  VERIFICATION: "My selfie verification was not approved",
  PHOTO: "A photo was removed or not sent",
  AUTOMATED: "An automated decision about me",
  OTHER: "Something else",
} as const;
export type AppealKind = keyof typeof APPEAL_KINDS;

/** Appeals are always decided by a person, and never by the staff member who made the original decision. */
export async function fileAppeal(a: { userId: string | null; contactEmail?: string | null; kind: AppealKind; refId?: string | null; details: string }) {
  if (a.userId) {
    const open = await db.query.appeals.findFirst({ where: and(eq(schema.appeals.userId, a.userId), eq(schema.appeals.status, "OPEN"), eq(schema.appeals.kind, a.kind)) });
    if (open) throw new ApiError(409, `You already have an open appeal about this (case ${open.caseNo}). We'll reply there.`, "appeal_open");
  }
  const [row] = await db.insert(schema.appeals).values({ caseNo: caseNo("A"), userId: a.userId, contactEmail: a.contactEmail ?? null, kind: a.kind, refId: a.refId ?? null, details: a.details }).returning();
  await audit(a.userId, "appeal.create", "appeal", row.id, { caseNo: row.caseNo, kind: a.kind });
  if (a.userId) await notify(a.userId, "MODERATION", "Your appeal has been received", `Case ${row.caseNo}. A member of our team who wasn't involved in the original decision will review it.`);
  return { id: row.id, caseNo: row.caseNo, message: `Your appeal has been received. Your case number is ${row.caseNo}.` };
}

export async function myAppeals(userId: string) {
  const rows = await db.select().from(schema.appeals).where(eq(schema.appeals.userId, userId)).orderBy(desc(schema.appeals.createdAt));
  return rows.map((r) => ({ caseNo: r.caseNo, kind: r.kind, status: r.status, decision: r.decision, createdAt: r.createdAt, decidedAt: r.decidedAt }));
}

/** Who made the decision being appealed (so they can't decide the appeal too). */
async function originalDecider(userId: string | null, kind: string): Promise<string | null> {
  if (!userId) return null;
  if (kind === "SUSPENSION" || kind === "BAN" || kind === "VERIFICATION") {
    const last = await db.query.moderationActions.findFirst({ where: eq(schema.moderationActions.targetUserId, userId), orderBy: desc(schema.moderationActions.createdAt) });
    return last?.actorId ?? null;
  }
  return null;
}

export async function decideAppeal(staffId: string, id: string, outcome: "UPHELD" | "OVERTURNED", decision: string) {
  const a = await db.query.appeals.findFirst({ where: eq(schema.appeals.id, id) });
  if (!a) throw new ApiError(404, "Appeal not found.", "not_found");
  if (a.status !== "OPEN") throw new ApiError(409, "This appeal has already been decided.", "decided");
  if ((await originalDecider(a.userId, a.kind)) === staffId) throw new ApiError(403, "Someone other than the person who made the original decision must review this appeal.", "four_eyes");
  await db.update(schema.appeals).set({ status: outcome, decision, decidedById: staffId, decidedAt: new Date() }).where(eq(schema.appeals.id, id));
  if (outcome === "OVERTURNED" && a.userId) {
    if (a.kind === "SUSPENSION" || a.kind === "BAN") await db.update(schema.users).set({ status: "ACTIVE" }).where(eq(schema.users.id, a.userId));
    if (a.kind === "RESTRICTION") await liftRestriction(a.userId, staffId, "appeal overturned");
    if (a.kind === "AUTOMATED" && a.refId) await db.update(schema.automatedDecisions).set({ reviewedById: staffId, reviewOutcome: "OVERTURNED" }).where(eq(schema.automatedDecisions.id, a.refId));
  }
  await audit(staffId, `appeal.${outcome.toLowerCase()}`, "appeal", id, { caseNo: a.caseNo, kind: a.kind });
  if (a.userId) await notify(a.userId, "MODERATION", outcome === "OVERTURNED" ? "Your appeal was successful" : "Your appeal was reviewed", `Case ${a.caseNo}: ${decision}`);
  return { status: outcome };
}
