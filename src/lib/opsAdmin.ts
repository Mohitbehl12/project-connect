import "server-only";
import { and, count, desc, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getConfig } from "./config";
import { githubConfigured, recentRuns } from "./github";
import { OPS_BANDS, RELEASE, bucketOf, metricsSince, percentile } from "./ops";

const isHttp = (r: string) => !r.startsWith("SIGNAL") && !r.startsWith("USAGE");

/** Everything the Engineering overview shows. Aggregates only — no member data. */
export async function opsOverview(now = new Date()) {
  const day = await metricsSince(new Date(now.getTime() - 24 * 3600_000));
  const http = day.filter((r) => isHttp(r.route));
  const hist = OPS_BANDS.map((_, i) => http.reduce((s, r) => s + (r.hist[i] ?? 0), 0));
  const totals = { requests: http.reduce((s, r) => s + r.count, 0), errors: http.reduce((s, r) => s + r.errors, 0), rejected: http.reduce((s, r) => s + r.rejected, 0), p95: percentile(hist, 0.95) };

  // Hourly series for the last 24 hours.
  const rows = await db.select().from(schema.opsMetrics).where(gte(schema.opsMetrics.bucket, bucketOf(new Date(now.getTime() - 24 * 3600_000))));
  const byHour = new Map<string, { requests: number; errors: number; hist: number[] }>();
  for (const r of rows.filter((x) => isHttp(x.route))) {
    const h = r.bucket.slice(0, 13);
    const a = byHour.get(h) ?? { requests: 0, errors: 0, hist: OPS_BANDS.map(() => 0) };
    a.requests += r.count; a.errors += r.errors;
    (JSON.parse(r.hist || "[]") as number[]).forEach((v, i) => { a.hist[i] += v; });
    byHour.set(h, a);
  }
  const series = [...byHour.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([hour, a]) => ({ hour: `${hour}:00Z`, requests: a.requests, errors: a.errors, p95: percentile(a.hist, 0.95) }));

  const health = await db.select().from(schema.opsHealth).orderBy(desc(schema.opsHealth.at)).limit(1);
  const open = await db.select({ severity: schema.opsIncidents.severity, status: schema.opsIncidents.status, n: count() }).from(schema.opsIncidents)
    .where(inArray(schema.opsIncidents.status, ["NEW", "TRIAGED", "PR_OPEN", "REGRESSED"])).groupBy(schema.opsIncidents.severity, schema.opsIncidents.status);
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const activity = await db.select({ agent: schema.opsActions.agent, action: schema.opsActions.action, n: count() }).from(schema.opsActions).where(gte(schema.opsActions.at, weekAgo)).groupBy(schema.opsActions.agent, schema.opsActions.action);
  const fixedWeek = await db.select({ n: count() }).from(schema.opsIncidents).where(and(gte(schema.opsIncidents.fixedAt, weekAgo)));
  const deploys = await db.select().from(schema.opsDeploys).orderBy(desc(schema.opsDeploys.startedAt)).limit(10);
  const proposals = await db.select({ status: schema.opsProposals.status, n: count() }).from(schema.opsProposals).groupBy(schema.opsProposals.status);
  let ci: { name: string; event: string; status: string; conclusion: string | null; branch: string; url: string; at: string }[] | null = null;
  if (githubConfigured()) ci = (await recentRuns().catch(() => [])).slice(0, 12).map((r) => ({ name: r.name, event: r.event, status: r.status, conclusion: r.conclusion, branch: r.head_branch, url: r.html_url, at: r.created_at }));
  const lastRuns = await getConfig("ops.lastRuns");
  const monitorAge = lastRuns.monitor ? now.getTime() - new Date(lastRuns.monitor).getTime() : null;

  return {
    release: RELEASE, totals, series,
    slowest: http.filter((r) => r.count >= 10).sort((a, b) => b.p95 - a.p95).slice(0, 8).map((r) => ({ route: r.route, count: r.count, p95: r.p95, avgMs: r.avgMs })),
    failing: http.filter((r) => r.errors > 0).sort((a, b) => b.errors - a.errors).slice(0, 8).map((r) => ({ route: r.route, count: r.count, errors: r.errors })),
    signals: day.filter((r) => r.route.startsWith("SIGNAL")).map((r) => ({ name: r.route.slice(7), count: r.count, failed: r.errors })),
    health: health[0] ? { ...health[0], checks: JSON.parse(health[0].checks) as Record<string, { ok: boolean; detail: string }> } : null,
    open: open.map((o) => ({ ...o })), activity, fixedThisWeek: fixedWeek[0].n,
    deploys: deploys.map((d) => ({ ...d, verdict: d.verdict ? JSON.parse(d.verdict) : null })),
    proposals, ci, lastRuns,
    setup: [
      { id: "monitor", label: "Monitor running every 5 minutes", ok: monitorAge !== null && monitorAge < 15 * 60_000, detail: lastRuns.monitor ? `last run ${lastRuns.monitor.slice(0, 16).replace("T", " ")} UTC` : "not run yet — needs CRON_SECRET (scripts/start.sh calls it)" },
      { id: "github", label: "GitHub connected (issues and PRs for the AI engineer)", ok: githubConfigured(), detail: githubConfigured() ? `repository ${process.env.GITHUB_REPO}` : "add GITHUB_TOKEN and GITHUB_REPO in Render" },
      { id: "rollback", label: "Automatic rollback", ok: !!(process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID), detail: process.env.RENDER_API_KEY ? ((await getConfig("ops.autoRollback")) ? "on" : "key set, but turned off in settings") : "add RENDER_API_KEY in Render to allow it" },
      { id: "email", label: "Alert emails", ok: !!(process.env.OPS_ALERT_EMAIL && process.env.RESEND_API_KEY), detail: process.env.OPS_ALERT_EMAIL ? "OPS_ALERT_EMAIL set" : "add OPS_ALERT_EMAIL (in-app alerts still go to staff)" },
      { id: "chat", label: "Slack / Teams alerts (optional)", ok: !!(process.env.OPS_SLACK_WEBHOOK_URL || process.env.OPS_TEAMS_WEBHOOK_URL), detail: process.env.OPS_SLACK_WEBHOOK_URL || process.env.OPS_TEAMS_WEBHOOK_URL ? "webhook set" : "add OPS_SLACK_WEBHOOK_URL or OPS_TEAMS_WEBHOOK_URL" },
    ],
  };
}

/** Earlier incidents on the same service or with similar words — shown as "seen before" with their fixes. */
export async function similarIncidents(inc: { id: string; service: string; title: string }) {
  const word = inc.title.split(/\W+/).filter((w) => w.length > 5).sort((a, b) => b.length - a.length)[0];
  return db.select({ code: schema.opsIncidents.code, title: schema.opsIncidents.title, status: schema.opsIncidents.status, prUrl: schema.opsIncidents.prUrl, diagnosis: schema.opsIncidents.diagnosis, lastSeen: schema.opsIncidents.lastSeen })
    .from(schema.opsIncidents)
    .where(and(sql`${schema.opsIncidents.id} != ${inc.id}`, word ? sql`(${schema.opsIncidents.service} = ${inc.service} or ${schema.opsIncidents.title} like ${`%${word}%`})` : sql`${schema.opsIncidents.service} = ${inc.service}`))
    .orderBy(desc(schema.opsIncidents.lastSeen)).limit(5);
}
