import "server-only";
import { and, count, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { feedbackSummary } from "./feedback";
import { opsAction } from "./ops";

// The weekly product health report (brief §32, §50): what improved, what got worse, new bugs, what members
// complain about, and what to build next. Counts only — no member is identifiable from it. No AI is needed
// to compute it; the AI engineer and staff read it to decide.

export const MEANINGFUL = { eachAtLeast: 3, total: 10 }; // a "meaningful connection": both wrote 3+, 10+ messages in all

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStart(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

async function n(q: Promise<{ n: number }[]>) { return (await q)[0]?.n ?? 0; }

export async function weekMetrics(from: Date, to: Date) {
  const inR = (col: any) => and(gte(col, from), lt(col, to));
  const u = schema.users;
  const signups = await n(db.select({ n: count() }).from(u).where(and(eq(u.role, "USER"), inR(u.createdAt))));
  const onboarded = await n(db.select({ n: count() }).from(u).where(and(eq(u.role, "USER"), inR(u.createdAt), eq(u.onboardingStep, 3))));
  const active = await n(db.select({ n: count() }).from(u).where(and(eq(u.role, "USER"), inR(u.lastActiveAt))));
  const likes = await n(db.select({ n: count() }).from(schema.likes).where(inR(schema.likes.createdAt)));
  const matches = await n(db.select({ n: count() }).from(schema.matches).where(inR(schema.matches.createdAt)));
  // Conversations from this week's matches: both people wrote at least once / a meaningful exchange.
  const perMatch = await db.all<{ match_id: string; a: number; b: number; total: number }>(sql`
    select m.id as match_id,
      sum(case when msg.sender_id = m.user_a_id then 1 else 0 end) as a,
      sum(case when msg.sender_id = m.user_b_id then 1 else 0 end) as b,
      count(msg.id) as total
    from matches m join messages msg on msg.match_id = m.id and msg.kind != 'SYSTEM'
    where m.created_at >= ${from.getTime()} and m.created_at < ${to.getTime()}
    group by m.id`);
  const conversations = perMatch.filter((r) => r.a > 0 && r.b > 0).length;
  const meaningful = perMatch.filter((r) => r.a >= MEANINGFUL.eachAtLeast && r.b >= MEANINGFUL.eachAtLeast && r.total >= MEANINGFUL.total).length;
  const datesProposed = await n(db.select({ n: count() }).from(schema.datePlans).where(inR(schema.datePlans.createdAt)));
  const datesConfirmed = await n(db.select({ n: count() }).from(schema.datePlans).where(and(inR(schema.datePlans.createdAt), eq(schema.datePlans.status, "CONFIRMED"))));
  const checkins = await n(db.select({ n: count() }).from(schema.dateCheckins).where(inR(schema.dateCheckins.createdAt)));
  const checkinAlerts = await n(db.select({ n: count() }).from(schema.dateCheckins).where(inR(schema.dateCheckins.alertedAt)));
  const reports = await n(db.select({ n: count() }).from(schema.reports).where(inR(schema.reports.createdAt)));
  const blocks = await n(db.select({ n: count() }).from(schema.blocks).where(inR(schema.blocks.createdAt)));
  const unmatches = await n(db.select({ n: count() }).from(schema.matches).where(and(inR(schema.matches.endedAt), isNotNull(schema.matches.unmatchedBy))));
  const payments = await n(db.select({ n: count() }).from(schema.payments).where(and(inR(schema.payments.paidAt), inArray(schema.payments.status, ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"]))));
  const incidents = await n(db.select({ n: count() }).from(schema.opsIncidents).where(inR(schema.opsIncidents.firstSeen)));
  const fixed = await n(db.select({ n: count() }).from(schema.opsIncidents).where(inR(schema.opsIncidents.fixedAt)));
  const rate = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return {
    signups, onboarded, active, likes, matches, conversations, meaningful, datesProposed, datesConfirmed, checkins, checkinAlerts, reports, blocks, unmatches, payments, incidents, fixed,
    onboardingRate: rate(onboarded, signups), conversationRate: rate(conversations, matches),
    meaningfulConnectionRate: rate(meaningful, matches), // the north-star metric
    reportsPer1kActive: active ? Math.round((reports / active) * 10000) / 10 : null,
  };
}

const LABELS: Record<string, string> = {
  signups: "Sign-ups", onboardingRate: "Finished onboarding (%)", active: "Active members", matches: "Matches", conversationRate: "Matches that became conversations (%)",
  meaningfulConnectionRate: "Meaningful connection rate (%)", datesProposed: "Dates proposed", checkins: "Date check-ins", reportsPer1kActive: "Reports per 1,000 active", payments: "Payments", incidents: "New incidents",
};
// For these, a rise is bad news.
const LOWER_IS_BETTER = new Set(["reportsPer1kActive", "incidents"]);

export async function buildProductReport(now = new Date()) {
  const end = weekStart(now), start = new Date(end.getTime() - 7 * 86400_000), prevStart = new Date(start.getTime() - 7 * 86400_000);
  const cur = await weekMetrics(start, end), prev = await weekMetrics(prevStart, start);
  const changes = Object.keys(LABELS).map((k) => {
    const a = (cur as Record<string, number | null>)[k], b = (prev as Record<string, number | null>)[k];
    const pct = a !== null && b !== null && b > 0 ? Math.round(((a - b) / b) * 100) : null;
    const better = pct === null ? null : LOWER_IS_BETTER.has(k) ? pct < 0 : pct > 0;
    return { key: k, label: LABELS[k], value: a, previous: b, changePct: pct, better };
  });
  // Only movements that are large and not tiny-sample noise.
  const notable = changes.filter((c) => c.changePct !== null && Math.abs(c.changePct) >= 10 && Math.max(c.value ?? 0, c.previous ?? 0) >= 10);
  const complaints = await db.select({ category: schema.reports.category, n: count() }).from(schema.reports).where(and(gte(schema.reports.createdAt, start), lt(schema.reports.createdAt, end))).groupBy(schema.reports.category).orderBy(desc(count())).limit(5);
  const newBugs = await db.select({ code: schema.opsIncidents.code, title: schema.opsIncidents.title, severity: schema.opsIncidents.severity, count: schema.opsIncidents.count })
    .from(schema.opsIncidents).where(and(gte(schema.opsIncidents.firstSeen, start), lt(schema.opsIncidents.firstSeen, end))).orderBy(desc(schema.opsIncidents.count)).limit(8);
  const fb = await feedbackSummary(7, end);
  const proposals = await db.select({ code: schema.opsProposals.code, title: schema.opsProposals.title, risk: schema.opsProposals.risk }).from(schema.opsProposals).where(eq(schema.opsProposals.status, "PROPOSED")).orderBy(desc(schema.opsProposals.createdAt)).limit(5);
  return {
    week: start.toISOString().slice(0, 10), generatedAt: now.toISOString(), metrics: cur, previous: prev, changes,
    improved: notable.filter((c) => c.better).map((c) => `${c.label}: ${c.previous} → ${c.value} (${c.changePct! > 0 ? "+" : ""}${c.changePct}%)`),
    worse: notable.filter((c) => c.better === false).map((c) => `${c.label}: ${c.previous} → ${c.value} (${c.changePct! > 0 ? "+" : ""}${c.changePct}%)`),
    newBugs, complaints, feedback: fb.contexts, nextUp: proposals,
  };
}

/** Called daily by the monitor: builds last week's report once, on or after Monday. */
export async function maybeWeeklyReport(now = new Date()) {
  const week = new Date(weekStart(now).getTime() - 7 * 86400_000).toISOString().slice(0, 10);
  if (await db.query.opsReports.findFirst({ where: eq(schema.opsReports.week, week) })) return null;
  const r = await buildProductReport(now);
  const [row] = await db.insert(schema.opsReports).values({ week: r.week, data: JSON.stringify(r) }).onConflictDoNothing().returning();
  if (row) await opsAction("PRODUCT_REPORT", "weekly_report", { detail: { week: r.week, improved: r.improved.length, worse: r.worse.length, newBugs: r.newBugs.length } });
  return row ? r : null;
}
