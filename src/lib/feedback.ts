import "server-only";
import { and, count, desc, eq, gte, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { recordIncident, scrub } from "./ops";

export const FEEDBACK_CONTEXTS = ["APP", "MATCH", "CHAT", "DATE", "CHECKIN", "PREMIUM", "ONBOARDING"] as const;
export const RATINGS = ["LOVE", "GOOD", "OKAY", "NEEDS_WORK", "PROBLEM", "DISMISSED"] as const;
const SCORE: Record<string, number> = { LOVE: 4, GOOD: 3, OKAY: 2, NEEDS_WORK: 1 };

/** Ask rarely: at most once a week overall, and once a month per moment. A "not now" counts as asking. */
export async function shouldAsk(userId: string, context: string, now = new Date()) {
  const week = new Date(now.getTime() - 7 * 86400_000), month = new Date(now.getTime() - 30 * 86400_000);
  const [{ n: recent }] = await db.select({ n: count() }).from(schema.feedback).where(and(eq(schema.feedback.userId, userId), gte(schema.feedback.createdAt, week)));
  if (recent) return false;
  const [{ n: here }] = await db.select({ n: count() }).from(schema.feedback).where(and(eq(schema.feedback.userId, userId), eq(schema.feedback.context, context), gte(schema.feedback.createdAt, month)));
  return here === 0;
}

export async function saveFeedback(userId: string, f: { context: string; rating: string; comment?: string; platform?: string; appVersion?: string }) {
  const comment = f.comment?.trim() ? scrub(f.comment.trim(), 500) : null;
  await db.insert(schema.feedback).values({ userId, context: f.context, rating: f.rating, comment, platform: f.platform ?? null, appVersion: f.appVersion ?? null });
  // "Report a problem" goes straight to the engineering queue as an incident (scrubbed, no identity).
  if (f.rating === "PROBLEM") {
    const inc = await recordIncident({ kind: "USER_REPORT", service: `feedback ${f.context.toLowerCase()}`, title: `Member reported a problem (${f.context.toLowerCase()}): ${scrub(comment ?? "no details", 90)}`,
      message: comment ?? "no details", severity: "MEDIUM", userId, context: { platform: f.platform, appVersion: f.appVersion }, fingerprintKey: `feedback:${f.context}:${(comment ?? "").toLowerCase().replace(/[^a-z ]/g, "").split(" ").filter((w) => w.length > 4).slice(0, 3).join("-")}` });
    return { code: inc?.code ?? null };
  }
  return { code: null };
}

/** Totals per moment for staff (last N days) + the newest comments, with no identities. */
export async function feedbackSummary(days = 30, now = new Date()) {
  const since = new Date(now.getTime() - days * 86400_000);
  const rows = await db.select({ context: schema.feedback.context, rating: schema.feedback.rating, n: count() }).from(schema.feedback)
    .where(and(gte(schema.feedback.createdAt, since), ne(schema.feedback.rating, "DISMISSED"))).groupBy(schema.feedback.context, schema.feedback.rating);
  const by = new Map<string, Record<string, number>>();
  for (const r of rows) by.set(r.context, { ...(by.get(r.context) ?? {}), [r.rating]: r.n });
  const contexts = [...by.entries()].map(([context, c]) => {
    const rated = ["LOVE", "GOOD", "OKAY", "NEEDS_WORK"].reduce((s, k) => s + (c[k] ?? 0), 0);
    const score = rated ? ["LOVE", "GOOD", "OKAY", "NEEDS_WORK"].reduce((s, k) => s + (c[k] ?? 0) * SCORE[k], 0) / rated : null;
    return { context, counts: c, responses: rated + (c.PROBLEM ?? 0), score: score === null ? null : Math.round(score * 100) / 100, unhappyPct: rated + (c.PROBLEM ?? 0) ? Math.round((((c.NEEDS_WORK ?? 0) + (c.PROBLEM ?? 0)) / (rated + (c.PROBLEM ?? 0))) * 100) : 0 };
  }).sort((a, b) => b.responses - a.responses);
  const comments = await db.select({ context: schema.feedback.context, rating: schema.feedback.rating, comment: schema.feedback.comment, at: schema.feedback.createdAt, platform: schema.feedback.platform })
    .from(schema.feedback).where(and(gte(schema.feedback.createdAt, since), ne(schema.feedback.rating, "DISMISSED"))).orderBy(desc(schema.feedback.createdAt)).limit(60);
  return { days, contexts, comments: comments.filter((c) => c.comment) };
}
