import "server-only";
import { and, count, eq, gte, like, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { getConfig } from "./config";
import { feedbackSummary } from "./feedback";
import { metricsSince, opsAction } from "./ops";

// The feature scout reads how Discover is used (aggregates only — never one person's activity) and writes
// improvement proposals. It never builds anything: a person approves a proposal in Admin → Engineering, and only
// then does it become a GitHub issue for the AI engineer. Each signal has a stable key so a proposal is made once;
// a rejected idea is not proposed again.

type Draft = { signal: string; title: string; problem: string; benefit: string; evidence: Record<string, unknown>; changes: string; risk: "LOW" | "MEDIUM" | "HIGH"; complexity: "S" | "M" | "L" };

const STEP_NAMES = ["profile", "preferences", "personality questions"];
// Features worth knowing about if nobody uses them (route prefix → plain name).
const FEATURES: [string, string][] = [["/api/cupid", "Cupid suggestions"], ["/api/dates", "date planning"], ["/api/travel", "travel mode"], ["/api/calls", "voice/video calls"], ["/api/referrals", "invite a friend"], ["/api/boosts", "boosts"], ["/api/compatibility", "compatibility view"]];

export async function scoutFeatures(now = new Date()): Promise<string[]> {
  const drafts: Draft[] = [];
  const day = 86400_000;
  const t = await getConfig("ops.thresholds");

  // 1) Onboarding drop-off: people who joined 2–30 days ago and stopped at a step.
  const stuck = await db.select({ step: schema.users.onboardingStep, n: count() }).from(schema.users)
    .where(and(eq(schema.users.role, "USER"), gte(schema.users.createdAt, new Date(now.getTime() - 30 * day)), lt(schema.users.createdAt, new Date(now.getTime() - 2 * day))))
    .groupBy(schema.users.onboardingStep);
  const joined = stuck.reduce((s, r) => s + r.n, 0);
  for (const r of stuck.filter((x) => x.step < 3)) {
    const pct = joined ? Math.round((r.n / joined) * 100) : 0;
    if (joined >= 20 && pct >= 25) drafts.push({
      signal: `onboarding:step${r.step}`, title: `Make the ${STEP_NAMES[r.step] ?? `step ${r.step}`} step of sign-up easier`,
      problem: `${pct}% of people who joined in the last month stopped at the ${STEP_NAMES[r.step] ?? `step ${r.step}`} step and never finished setting up.`,
      benefit: "More people reach Discover and can match; fewer empty sign-ups.", evidence: { joined, stoppedHere: r.n, pct, window: "joined 2–30 days ago" },
      changes: "Look at the step's required fields and copy; let optional parts be skipped and finished later; save progress per field; add a progress indicator if missing; a gentle reminder email after 24 hours (opt-out respected).",
      risk: "LOW", complexity: "M",
    });
  }

  // 2) Searches that find nobody.
  const week = await metricsSince(new Date(now.getTime() - 7 * day));
  const searches = week.find((r) => r.route === "USAGE search")?.count ?? 0, zero = week.find((r) => r.route === "USAGE search_zero")?.count ?? 0;
  if (searches >= 50 && zero / searches >= 0.25) drafts.push({
    signal: "search:zero-results", title: "Help people when a search finds nobody",
    problem: `${Math.round((zero / searches) * 100)}% of filtered searches in the last 7 days returned no one (${zero} of ${searches}).`,
    benefit: "Fewer dead ends in Discover; people find matches instead of giving up.", evidence: { searches, zeroResults: zero, window: "7 days" },
    changes: "On an empty result, show which filter removed the most people and offer one tap to widen it (distance, age range); remember the widened choice only if the person keeps it.",
    risk: "LOW", complexity: "S",
  });

  // 3) Checkout abandonment and payment failures.
  const since14 = new Date(now.getTime() - 14 * day);
  const pay = await db.select({ status: schema.payments.status, n: count() }).from(schema.payments).where(and(gte(schema.payments.createdAt, since14), lt(schema.payments.createdAt, new Date(now.getTime() - 3600_000)))).groupBy(schema.payments.status);
  const started = pay.reduce((s, r) => s + r.n, 0), paid = pay.filter((r) => ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(r.status)).reduce((s, r) => s + r.n, 0);
  const failed = pay.find((r) => r.status === "FAILED")?.n ?? 0;
  if (started >= 20 && (started - paid) / started >= 0.6) drafts.push({
    signal: "checkout:abandonment", title: "Find out why people leave checkout",
    problem: `${started - paid} of ${started} checkouts in the last 14 days were not completed (${failed} failed at the bank, the rest were left).`,
    benefit: "More of the people who already chose to pay complete it — without pressure tactics.", evidence: { started, paid, failed, window: "14 days" },
    changes: "Check the checkout screen on small phones; show the full price and renewal terms before the payment sheet; offer UPI first in India; if payment fails, say why in plain words and let them retry in one tap. No countdown timers or fake scarcity.",
    risk: "MEDIUM", complexity: "M",
  });

  // 4) Slow screens people use a lot.
  for (const r of week.filter((x) => !x.route.startsWith("SIGNAL") && !x.route.startsWith("USAGE") && x.count >= 200 && x.p95 > t.p95Ms).sort((a, b) => b.count - a.count).slice(0, 3)) drafts.push({
    signal: `perf:${r.route}`, title: `Speed up ${r.route}`,
    problem: `${r.route} served ${r.count} requests this week; 1 in 20 took longer than ${r.p95} ms (average ${r.avgMs} ms).`,
    benefit: "Screens open faster, especially on slow mobile networks.", evidence: { route: r.route, requests: r.count, p95: r.p95, avgMs: r.avgMs, window: "7 days" },
    changes: "Profile the handler; add missing indexes; avoid per-row queries (N+1); cache read-mostly data briefly; page large lists.",
    risk: "LOW", complexity: "M",
  });

  // 5) What people report most.
  const reps = await db.select({ category: schema.reports.category, n: count() }).from(schema.reports).where(gte(schema.reports.createdAt, since14)).groupBy(schema.reports.category);
  const totalReps = reps.reduce((s, r) => s + r.n, 0);
  for (const r of reps.filter((x) => totalReps >= 20 && x.n / totalReps >= 0.4)) drafts.push({
    signal: `safety:${r.category}`, title: `Reduce "${r.category.replace(/_/g, " ").toLowerCase()}" reports`,
    problem: `${Math.round((r.n / totalReps) * 100)}% of reports in the last 14 days were "${r.category}" (${r.n} of ${totalReps}).`,
    benefit: "Fewer bad experiences and less moderation load.", evidence: { category: r.category, reports: r.n, total: totalReps, window: "14 days" },
    changes: "Review a sample of closed cases with the safety team; consider an earlier automated check or a clearer prompt at the moment it happens. Changes to moderation rules need human sign-off.",
    risk: "HIGH", complexity: "M",
  });

  // 6) Features almost nobody uses (only once there is real traffic).
  const fortnight = await metricsSince(since14);
  const traffic = fortnight.filter((r) => !r.route.startsWith("SIGNAL") && !r.route.startsWith("USAGE")).reduce((s, r) => s + r.count, 0);
  if (traffic >= 20_000) for (const [prefix, name] of FEATURES) {
    const used = fortnight.filter((r) => r.route.includes(` ${prefix}`)).reduce((s, r) => s + r.count, 0);
    if (used / traffic < 0.001) drafts.push({
      signal: `unused:${prefix}`, title: `Make ${name} easier to find — or retire it`,
      problem: `${name} got ${used} requests out of ${traffic} in 14 days.`, benefit: "Either people discover something useful, or the app gets simpler.",
      evidence: { feature: name, requests: used, allRequests: traffic, window: "14 days" },
      changes: `Check where ${name} is reachable from; test a clearer entry point; if it still isn't used after a month, propose removing it.`, risk: "LOW", complexity: "S",
    });
  }

  // 7) What members tell us directly (in-app feedback).
  for (const c of (await feedbackSummary(30, now)).contexts.filter((x) => x.responses >= 20 && x.unhappyPct >= 30)) drafts.push({
    signal: `feedback:${c.context}`, title: `Improve the ${c.context.toLowerCase()} experience members rate poorly`,
    problem: `${c.unhappyPct}% of ${c.responses} ratings of "${c.context.toLowerCase()}" in the last 30 days were "needs improvement" or a reported problem (average ${c.score ?? "–"} of 4).`,
    benefit: "Fixes what members say is wrong, in their words.", evidence: { context: c.context, responses: c.responses, unhappyPct: c.unhappyPct, score: c.score, window: "30 days" },
    changes: "Read the comments for this moment in Admin → Engineering → Feedback; group them; fix the most common one first.", risk: "LOW", complexity: "M",
  });

  const made: string[] = [];
  const year = now.getUTCFullYear();
  for (const d of drafts) {
    const exists = await db.query.opsProposals.findFirst({ where: eq(schema.opsProposals.signal, d.signal) });
    if (exists) continue;
    const [{ n }] = await db.select({ n: count() }).from(schema.opsProposals).where(like(schema.opsProposals.code, `FEAT-${year}-%`));
    const code = `FEAT-${year}-${String(n + 1).padStart(4, "0")}`;
    const [p] = await db.insert(schema.opsProposals).values({ code, signal: d.signal, title: d.title, problem: d.problem, benefit: d.benefit, evidence: JSON.stringify(d.evidence), changes: d.changes, risk: d.risk, complexity: d.complexity }).onConflictDoNothing().returning();
    if (p) { made.push(code); await opsAction("FEATURE_SCOUT", "proposal_created", { proposalId: p.id, detail: { code, signal: d.signal } }); }
  }
  return made;
}
