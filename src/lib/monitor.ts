import "server-only";
import { statfs } from "node:fs/promises";
import os from "node:os";
import { and, count, desc, eq, gte, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyAuditChain } from "./audit";
import { getConfig, setConfig } from "./config";
import { sendEmail } from "./email";
import { aiDiagnosis, aiPulls, closeIssue, commentIssue, createIssue, githubConfigured } from "./github";
import { notify } from "./notify";
import { RELEASE, flushMetrics, metricsSince, opsAction, recordIncident, riskBand, type Severity } from "./ops";
import { can } from "./rbac";
import { maybeWeeklyReport } from "./productReport";
import { scoutFeatures } from "./scout";
import { storage } from "./storage";

// The 24×7 monitor. Called every 5 minutes (scripts/start.sh → /api/cron/monitor). Each run is cheap; hourly and
// daily checks are gated on their last run. It detects and records; it never changes code, data or releases —
// the one exception is rolling back a release that the watchdog finds broken (policy below, can be turned off).

const SEV: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const atLeast = (a: string, b: string) => SEV.indexOf(a as Severity) >= SEV.indexOf(b as Severity);
const SLOW_OK = /discovery|explore|export|backups|reach|catalogue|compliance/; // heavier routes get the higher budget

export async function runMonitor(now = new Date()) {
  const runs = await getConfig("ops.lastRuns");
  const due = (k: keyof typeof runs, mins: number) => !runs[k] || now.getTime() - new Date(runs[k]!).getTime() >= mins * 60_000 - 5_000;
  const out: Record<string, unknown> = {};
  out.metricsFlushed = await flushMetrics();
  out.health = await vitals(now);
  out.anomalies = await anomalies(now);
  out.watchdog = await watchdog(now);
  if (due("hourly", 60)) { out.hourly = await hourly(now); runs.hourly = now.toISOString(); }
  if (due("daily", 24 * 60)) { out.daily = await daily(now); runs.daily = now.toISOString(); }
  if (githubConfigured() && due("github", 15)) { out.github = await githubSync().catch((e) => ({ error: String(e.message ?? e) })); runs.github = now.toISOString(); }
  out.alerts = await sendAlerts();
  runs.monitor = now.toISOString();
  await setConfig("ops.lastRuns", runs, "system");
  return out;
}

// ---- vital signs ----------------------------------------------------------------------------------------------
async function vitals(now: Date) {
  const t = await getConfig("ops.thresholds");
  const mem = process.memoryUsage();
  const limitMb = Number(process.env.MEMORY_LIMIT_MB ?? 512);
  const t0 = Date.now();
  await db.select({ n: count() }).from(schema.users).limit(1);
  const dbMs = Date.now() - t0;
  let diskFreePct: number | null = null;
  try { const s = await statfs(process.env.DATA_DIR ?? process.env.UPLOAD_DIR ?? "."); diskFreePct = Math.round((s.bavail / s.blocks) * 1000) / 10; } catch { /* not supported here */ }
  const checks: Record<string, { ok: boolean; detail: string }> = {};
  checks.database = { ok: dbMs < t.dbMs, detail: `${dbMs} ms` };
  try {
    const key = `ops/probe-${process.pid}.txt`, body = Buffer.from(now.toISOString());
    await storage().put(key, body, "text/plain");
    const back = await storage().get(key);
    await storage().delete(key);
    checks.storage = { ok: !!back && back.equals(body), detail: back ? "write/read OK" : "read back nothing" };
  } catch (e) { checks.storage = { ok: false, detail: String((e as Error).message).slice(0, 120) }; }
  checks.memory = { ok: mem.rss / 1048576 < (limitMb * t.memoryPct) / 100, detail: `${Math.round(mem.rss / 1048576)} of ${limitMb} MB` };
  if (diskFreePct !== null) checks.disk = { ok: diskFreePct > t.diskFreePct, detail: `${diskFreePct}% free` };
  const lb = await getConfig("ops.lastBackup");
  const everyH = Number(process.env.BACKUP_EVERY_HOURS ?? 6);
  if (process.env.BACKUP_DRIVER || process.env.BACKUP_DIR || process.env.S3_BACKUP_BUCKET) checks.backups = { ok: !!lb.at && now.getTime() - new Date(lb.at).getTime() < everyH * 2 * 3600_000 && !lb.error, detail: lb.at ? `last ${lb.at.slice(0, 16)}Z` : "none yet" };
  checks.email = { ok: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM), detail: process.env.RESEND_API_KEY ? "configured" : "not configured" };
  checks.payments = { ok: process.env.BILLING_PROVIDER === "razorpay" ? !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_WEBHOOK_SECRET) : true, detail: process.env.BILLING_PROVIDER ?? "mock" };
  checks.calls = { ok: !!(process.env.CLOUDFLARE_TURN_KEY_ID || process.env.TURN_URLS), detail: process.env.CLOUDFLARE_TURN_KEY_ID || process.env.TURN_URLS ? "TURN relay configured" : "no TURN relay (calls may fail on mobile data)" };
  const row = { rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576), load1: Math.round(os.loadavg()[0] * 100) / 100, cpus: os.cpus().length, diskFreePct, dbMs, checks: JSON.stringify(checks) };
  await db.insert(schema.opsHealth).values(row);
  // Real failures become incidents (configuration gaps are shown on the dashboard, not raised as incidents).
  for (const k of ["database", "storage", "memory", "disk", "backups"] as const) {
    const c = checks[k];
    if (c && !c.ok) await recordIncident({ kind: k === "database" ? "PERFORMANCE" : "UPTIME", service: `system ${k}`, title: `${k[0].toUpperCase() + k.slice(1)} check failing: ${c.detail}`, fingerprintKey: `vital:${k}`,
      severity: k === "storage" || k === "disk" ? "CRITICAL" : "HIGH", context: { metric: k, value: c.detail } });
  }
  return { ...row, checks };
}

// ---- request anomalies, integration failures, sign-in attacks ------------------------------------------------
async function anomalies(now: Date) {
  const t = await getConfig("ops.thresholds");
  const found: string[] = [];
  const last15 = await metricsSince(new Date(now.getTime() - 15 * 60_000));
  const http = last15.filter((r) => !r.route.startsWith("SIGNAL") && !r.route.startsWith("USAGE"));
  const total = http.reduce((s, r) => s + r.count, 0), errors = http.reduce((s, r) => s + r.errors, 0);
  if (total >= t.minRequests && (errors / total) * 100 > t.errorRatePct) {
    found.push("error_rate");
    await recordIncident({ kind: "ANOMALY", service: "all routes", title: `Server errors at ${((errors / total) * 100).toFixed(1)}% of requests (limit ${t.errorRatePct}%)`, fingerprintKey: "anomaly:error-rate",
      severity: errors / total > 0.1 ? "CRITICAL" : "HIGH", context: { metric: "error rate", value: `${errors}/${total}`, threshold: `${t.errorRatePct}%`, window: "15 min" } });
  }
  const last30 = await metricsSince(new Date(now.getTime() - 30 * 60_000));
  for (const r of last30.filter((x) => !x.route.startsWith("SIGNAL") && !x.route.startsWith("USAGE") && x.count >= 20)) {
    const budget = SLOW_OK.test(r.route) ? t.p95SlowMs : t.p95Ms;
    if (r.p95 > budget) {
      found.push(`slow:${r.route}`);
      await recordIncident({ kind: "PERFORMANCE", service: r.route, title: `${r.route} is slow: 95% of requests within ${r.p95} ms (budget ${budget} ms)`, fingerprintKey: `slow:${r.route}`,
        severity: r.p95 > budget * 2 ? "HIGH" : "MEDIUM", context: { metric: "p95", value: r.p95, threshold: budget, window: "30 min", route: r.route } });
    }
  }
  const lastHour = await metricsSince(new Date(now.getTime() - 60 * 60_000));
  for (const r of lastHour.filter((x) => x.route.startsWith("SIGNAL") && x.errors >= 3)) {
    const pct = (r.errors / r.count) * 100;
    if (pct < t.signalFailPct) continue;
    const name = r.route.slice(7);
    found.push(`signal:${name}`);
    await recordIncident({ kind: /payment/.test(name) ? "PAYMENT" : "ANOMALY", service: `integration ${name}`, title: `${name.replace(/_/g, " ")} failing: ${r.errors} of ${r.count} in the last hour`, fingerprintKey: `signal:${name}`,
      severity: /payment/.test(name) ? "HIGH" : "MEDIUM", context: { metric: name, value: `${r.errors}/${r.count}`, threshold: `${t.signalFailPct}%`, window: "1 h" } });
  }
  // Sign-in attacks: many failures overall, or from one address.
  const since = new Date(now.getTime() - 15 * 60_000);
  const [{ n: failed }] = await db.select({ n: count() }).from(schema.loginEvents).where(and(eq(schema.loginEvents.success, false), gte(schema.loginEvents.createdAt, since)));
  if (failed >= t.failedLogins15m) {
    found.push("login_failures");
    await recordIncident({ kind: "SECURITY", service: "POST /api/auth/login", title: `${failed} failed sign-ins in 15 minutes`, fingerprintKey: "security:login-failures", severity: "HIGH", context: { metric: "failed sign-ins", value: failed, threshold: t.failedLogins15m, window: "15 min" } });
  }
  const byIp = await db.select({ ip: schema.loginEvents.ip, n: count() }).from(schema.loginEvents)
    .where(and(eq(schema.loginEvents.success, false), gte(schema.loginEvents.createdAt, since), isNotNull(schema.loginEvents.ip))).groupBy(schema.loginEvents.ip).having(sql`count(*) >= ${t.failedLoginsPerIp15m}`);
  if (byIp.length) {
    found.push("login_ip");
    await recordIncident({ kind: "SECURITY", service: "POST /api/auth/login", title: `Password guessing from ${byIp.length} address${byIp.length === 1 ? "" : "es"}`, fingerprintKey: "security:login-ip", severity: "HIGH",
      context: { metric: "failed sign-ins per address", value: Math.max(...byIp.map((b) => b.n)), threshold: t.failedLoginsPerIp15m, window: "15 min" } });
  }
  return found;
}

// ---- release watchdog -----------------------------------------------------------------------------------------
async function watchdog(now: Date) {
  if (RELEASE === "dev") return { release: "dev", status: "not watched" };
  let d = await db.query.opsDeploys.findFirst({ where: eq(schema.opsDeploys.commit, RELEASE) });
  if (!d) {
    [d] = await db.insert(schema.opsDeploys).values({ commit: RELEASE }).onConflictDoNothing().returning();
    d ??= await db.query.opsDeploys.findFirst({ where: eq(schema.opsDeploys.commit, RELEASE) });
    if (d) await opsAction("WATCHDOG", "release_started", { detail: { commit: RELEASE } });
  }
  if (!d || d.status !== "WATCHING") return { release: RELEASE, status: d?.status };
  const age = now.getTime() - d.startedAt.getTime();
  if (age < 15 * 60_000) return { release: RELEASE, status: "WATCHING", minutes: Math.round(age / 60_000) };
  const after = await metricsSince(d.startedAt);
  const baseRows = (await metricsSince(new Date(d.startedAt.getTime() - 24 * 3600_000))); // includes "after" too; subtract it
  const sum = (rows: typeof after) => { const h = rows.filter((r) => !r.route.startsWith("SIGNAL") && !r.route.startsWith("USAGE")); return { count: h.reduce((s, r) => s + r.count, 0), errors: h.reduce((s, r) => s + r.errors, 0) }; };
  const a = sum(after), all = sum(baseRows), b = { count: all.count - a.count, errors: all.errors - a.errors };
  const rateA = a.count ? a.errors / a.count : 0, rateB = b.count ? b.errors / b.count : 0;
  const newHigh = await db.select({ n: count() }).from(schema.opsIncidents)
    .where(and(gte(schema.opsIncidents.firstSeen, d.startedAt), inArray(schema.opsIncidents.severity, ["HIGH", "CRITICAL"]), inArray(schema.opsIncidents.kind, ["SERVER_ERROR", "CLIENT_ERROR", "PAYMENT"])));
  const crashes = await db.select({ n: sql<number>`coalesce(sum(${schema.opsIncidents.count}), 0)` }).from(schema.opsIncidents)
    .where(and(gte(schema.opsIncidents.firstSeen, d.startedAt), eq(schema.opsIncidents.kind, "CLIENT_ERROR"), eq(schema.opsIncidents.severity, "HIGH")));
  const verdict = { after: { requests: a.count, errors: a.errors, rate: rateA }, baseline: { requests: b.count, errors: b.errors, rate: rateB }, newHighIncidents: newHigh[0].n, crashes: Number(crashes[0].n) };
  const broken = (a.count >= 50 && rateA > Math.max(0.02, rateB * 3)) || newHigh[0].n >= 3 || Number(crashes[0].n) >= 10;
  if (!broken) {
    if (age < 60 * 60_000 && a.count < 50) return { release: RELEASE, status: "WATCHING", note: "waiting for traffic", verdict };
    await db.update(schema.opsDeploys).set({ status: "HEALTHY", verdict: JSON.stringify(verdict), decidedAt: now }).where(eq(schema.opsDeploys.id, d.id));
    await opsAction("WATCHDOG", "release_healthy", { detail: { commit: RELEASE, ...verdict } });
    return { release: RELEASE, status: "HEALTHY", verdict };
  }
  const inc = await recordIncident({ kind: "DEPLOY", service: `release ${RELEASE}`, title: `Release ${RELEASE} made things worse: errors ${(rateA * 100).toFixed(1)}% (was ${(rateB * 100).toFixed(1)}%), ${newHigh[0].n} new serious incidents`,
    fingerprintKey: `deploy:${RELEASE}`, severity: "CRITICAL", context: { metric: "release health", value: JSON.stringify(verdict) } });
  let status = "DEGRADED";
  if ((await getConfig("ops.autoRollback")) && process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID) {
    const r = await rollback(`watchdog: release ${RELEASE} unhealthy`);
    status = r.ok ? "ROLLED_BACK" : "ROLLBACK_FAILED";
    await opsAction("WATCHDOG", r.ok ? "rollback" : "rollback_failed", { incidentId: inc?.id, risk: 90, result: r.ok ? "OK" : "FAILED", detail: { commit: RELEASE, ...r } });
  } else {
    await opsAction("WATCHDOG", "rollback_skipped", { incidentId: inc?.id, risk: 90, detail: { reason: process.env.RENDER_API_KEY ? "auto rollback is off" : "RENDER_API_KEY not set — roll back in Render" } });
  }
  await db.update(schema.opsDeploys).set({ status, verdict: JSON.stringify(verdict), decidedAt: now }).where(eq(schema.opsDeploys.id, d.id));
  return { release: RELEASE, status, verdict };
}

/** Asks Render to put the previous good release back. Used by the watchdog and the dashboard's button. */
export async function rollback(reason: string): Promise<{ ok: boolean; to?: string; error?: string }> {
  const key = process.env.RENDER_API_KEY, svc = process.env.RENDER_SERVICE_ID;
  if (!key || !svc) return { ok: false, error: "RENDER_API_KEY and RENDER_SERVICE_ID are needed" };
  try {
    const h = { authorization: `Bearer ${key}`, accept: "application/json", "content-type": "application/json" };
    const res = await fetch(`https://api.render.com/v1/services/${svc}/deploys?limit=20`, { headers: h, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, error: `Render list deploys: ${res.status}` };
    const list = (await res.json()) as { deploy: { id: string; status: string; commit?: { id: string } } }[];
    const healthy = new Set((await db.select({ c: schema.opsDeploys.commit }).from(schema.opsDeploys).where(eq(schema.opsDeploys.status, "HEALTHY"))).map((x) => x.c));
    const target = list.map((x) => x.deploy).find((x) => x.commit?.id && !x.commit.id.startsWith(RELEASE) && ["deactivated", "live"].includes(x.status) && (healthy.size === 0 || healthy.has(x.commit.id.slice(0, 12))));
    if (!target) return { ok: false, error: "no earlier healthy release found" };
    const rb = await fetch(`https://api.render.com/v1/services/${svc}/rollback`, { method: "POST", headers: h, body: JSON.stringify({ deployId: target.id }), signal: AbortSignal.timeout(15_000) });
    if (!rb.ok) return { ok: false, error: `Render rollback: ${rb.status} ${(await rb.text()).slice(0, 120)}` };
    await opsAction("WATCHDOG", "rollback_requested", { detail: { reason, to: target.commit?.id?.slice(0, 12), deployId: target.id } });
    return { ok: true, to: target.commit?.id?.slice(0, 12) };
  } catch (e) { return { ok: false, error: String((e as Error).message).slice(0, 160) }; }
}

// ---- hourly: data quality and the audit chain ----------------------------------------------------------------
async function hourly(now: Date) {
  const checks: [string, string, () => Promise<number>][] = [
    ["blocked-matches", "Active matches between people who blocked each other", async () => (await db.select({ n: count() }).from(schema.matches)
      .innerJoin(schema.blocks, or(and(eq(schema.blocks.blockerId, schema.matches.userAId), eq(schema.blocks.blockedId, schema.matches.userBId)), and(eq(schema.blocks.blockerId, schema.matches.userBId), eq(schema.blocks.blockedId, schema.matches.userAId))))
      .where(eq(schema.matches.status, "ACTIVE")))[0].n],
    ["onboarded-without-profile", "Members marked as set up but with no profile", async () => (await db.select({ n: count() }).from(schema.users)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id)).where(and(eq(schema.users.role, "USER"), eq(schema.users.onboardingStep, 3), sql`${schema.profiles.userId} is null`)))[0].n],
    ["negative-ad-balance", "Advertisers with a negative balance", async () => (await db.select({ n: count() }).from(schema.advertisers).where(lt(schema.advertisers.balanceMinor, 0)))[0].n],
    ["ads-from-suspended", "Ads still running for a suspended advertiser", async () => (await db.select({ n: count() }).from(schema.adCampaigns)
      .innerJoin(schema.advertisers, eq(schema.advertisers.id, schema.adCampaigns.advertiserId)).where(and(eq(schema.adCampaigns.status, "ACTIVE"), ne(schema.advertisers.status, "ACTIVE"))))[0].n],
    ["stale-webhooks", "Payment webhooks stuck as failed", async () => (await db.select({ n: count() }).from(schema.webhookEvents)
      .where(and(eq(schema.webhookEvents.status, "FAILED"), lt(schema.webhookEvents.receivedAt, new Date(now.getTime() - 3600_000)))))[0].n],
    ["self-matches", "Matches of a person with themselves", async () => (await db.select({ n: count() }).from(schema.matches).where(eq(schema.matches.userAId, schema.matches.userBId)))[0].n],
  ];
  const results: Record<string, number> = {};
  for (const [key, title, fn] of checks) {
    try {
      const n = await fn();
      results[key] = n;
      if (n > 0) await recordIncident({ kind: "DATA_QUALITY", service: `data ${key}`, title: `${title}: ${n}`, fingerprintKey: `dq:${key}`, severity: key === "stale-webhooks" ? "HIGH" : "MEDIUM", context: { metric: key, rows: n } });
    } catch (e) { results[key] = -1; console.error("[monitor] data check failed", key, (e as Error).message); }
  }
  const chain = await verifyAuditChain();
  results.auditChain = chain.ok ? 1 : 0;
  if (!chain.ok) await recordIncident({ kind: "SECURITY", service: "audit log", title: `Audit log chain broken at row ${chain.brokenAt} (${chain.reason})`, fingerprintKey: "security:audit-chain", severity: "CRITICAL", context: { detail: chain.reason, value: chain.brokenAt } });
  return results;
}

// ---- daily: feature scout and retention -----------------------------------------------------------------------
async function daily(now: Date) {
  const proposals = await scoutFeatures(now).catch((e) => { console.error("[monitor] scout failed", e); return []; });
  const report = await maybeWeeklyReport(now).catch((e) => { console.error("[monitor] weekly report failed", e); return null; });
  if (report) await sendWeeklyReport(report);
  const old = new Date(now.getTime() - 30 * 86400_000).toISOString().slice(0, 16);
  await db.delete(schema.opsMetrics).where(lt(schema.opsMetrics.bucket, old));
  await db.delete(schema.opsHealth).where(lt(schema.opsHealth.at, new Date(now.getTime() - 14 * 86400_000)));
  // Keep the newest 50 occurrences of each incident.
  await db.run(sql`delete from ops_incident_events where id in (select id from (select id, row_number() over (partition by incident_id order by at desc) rn from ops_incident_events) where rn > 50)`);
  return { proposals };
}

// ---- alerts ---------------------------------------------------------------------------------------------------
async function sendAlerts() {
  const min = await getConfig("ops.alertMinSeverity");
  const rows = await db.select().from(schema.opsIncidents).where(inArray(schema.opsIncidents.status, ["NEW", "TRIAGED", "PR_OPEN", "REGRESSED"])).orderBy(desc(schema.opsIncidents.lastSeen)).limit(200);
  // Alert once when first seen, again on regression, and when it keeps growing (10, 100, 1000 occurrences).
  const due = rows.filter((r) => atLeast(r.severity, min) && (r.notifiedCount === 0 || (r.status === "REGRESSED" && (!r.notifiedAt || r.notifiedAt < r.lastSeen) && r.notifiedCount < 99) || [10, 100, 1000].some((m) => r.count >= m && r.notifiedCount < m)));
  if (!due.length) return 0;
  const staff = (await db.select({ id: schema.users.id, email: schema.users.email, role: schema.users.role }).from(schema.users).where(and(ne(schema.users.role, "USER"), ne(schema.users.role, "ADVERTISER"), eq(schema.users.status, "ACTIVE"))))
    .filter((u) => can(u.role, "ops.view"));
  const emails = (process.env.OPS_ALERT_EMAIL ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const r of due) {
    const app = process.env.APP_URL ?? "";
    const line = `${r.code} · ${r.severity} · risk ${r.risk} (${riskBand(r.risk)}) · ${r.title} · ${r.count}× · ${r.usersAffected} people`;
    for (const s of staff) await notify(s.id, "SECURITY", `${r.status === "REGRESSED" ? "Came back" : "New incident"}: ${r.code} (${r.severity.toLowerCase()})`, r.title, `/admin/engineering?incident=${r.code}`);
    for (const to of emails) await sendEmail(to, `[Discover ${r.severity}] ${r.code}: ${r.title}`.slice(0, 180), `${line}\n\n${app}/admin/engineering?incident=${r.code}`, `<p>${esc(line)}</p><p><a href="${esc(app)}/admin/engineering?incident=${r.code}">Open in Admin → Engineering</a></p>`);
    for (const url of [process.env.OPS_SLACK_WEBHOOK_URL, process.env.OPS_TEAMS_WEBHOOK_URL].filter((u): u is string => !!u && /^https:\/\/(hooks\.slack\.com|[\w.-]+\.webhook\.office\.com|[\w.-]+\.logic\.azure\.com)\//.test(u)))
      await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `:rotating_light: ${line}\n${app}/admin/engineering?incident=${r.code}` }), signal: AbortSignal.timeout(8000) }).catch(() => {});
    const next = r.notifiedCount === 0 ? 1 : [10, 100, 1000].find((m) => r.count >= m && r.notifiedCount < m) ?? r.notifiedCount + 1;
    await db.update(schema.opsIncidents).set({ notifiedAt: new Date(), notifiedCount: next }).where(eq(schema.opsIncidents.id, r.id));
    await opsAction("MONITOR", "alert_sent", { incidentId: r.id, risk: r.risk, detail: { code: r.code, staff: staff.length, emails: emails.length } });
  }
  return due.length;
}
async function sendWeeklyReport(r: Awaited<ReturnType<typeof maybeWeeklyReport>> & object) {
  const m = r.metrics, app = process.env.APP_URL ?? "";
  const lines = [
    `Week of ${r.week}: ${m.signups} sign-ups, ${m.matches} matches, meaningful connection rate ${m.meaningfulConnectionRate ?? "–"}%.`,
    r.improved.length ? `Better: ${r.improved.join("; ")}` : "Nothing improved by 10% or more.",
    r.worse.length ? `Worse: ${r.worse.join("; ")}` : "Nothing got worse by 10% or more.",
    `New incidents: ${r.newBugs.length}. Ideas waiting for a decision: ${r.nextUp.length}.`,
  ];
  for (const to of (process.env.OPS_ALERT_EMAIL ?? "").split(",").map((x) => x.trim()).filter(Boolean))
    await sendEmail(to, `[Discover] Product health, week of ${r.week}`, `${lines.join("\n\n")}\n\n${app}/admin/engineering?tab=health`, lines.map((l) => `<p>${esc(l)}</p>`).join("") + `<p><a href="${esc(app)}/admin/engineering?tab=health">Open the full report</a></p>`);
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---- GitHub: the AI engineer's queue ----------------------------------------------------------------------------
export async function githubSync() {
  const min = await getConfig("ops.issueMinSeverity");
  let opened = 0, updated = 0;
  // 1) New incidents above the bar → an issue each (diagnosis only for high/critical risk: the label says so).
  const todo = await db.select().from(schema.opsIncidents).where(and(inArray(schema.opsIncidents.status, ["NEW", "REGRESSED"]), sql`${schema.opsIncidents.githubIssue} is null`)).limit(20);
  for (const r of todo.filter((x) => atLeast(x.severity, min) || x.count >= 10)) {
    const band = riskBand(r.risk);
    const policy = band === "Low" || band === "Medium" ? "Fix it: open a PR (a person approves every merge)." : band === "High" ? "Diagnose and propose: draft PR only, clearly marked." : "Do not change code: write a diagnosis for a person.";
    const similar = await db.select({ code: schema.opsIncidents.code, title: schema.opsIncidents.title, prUrl: schema.opsIncidents.prUrl, diagnosis: schema.opsIncidents.diagnosis }).from(schema.opsIncidents)
      .where(and(eq(schema.opsIncidents.service, r.service), ne(schema.opsIncidents.id, r.id), eq(schema.opsIncidents.status, "FIXED"))).limit(3);
    const events = await db.select().from(schema.opsIncidentEvents).where(eq(schema.opsIncidentEvents.incidentId, r.id)).orderBy(desc(schema.opsIncidentEvents.at)).limit(5);
    const body = [
      `**${r.code}** · ${r.kind} · severity **${r.severity}** · risk **${r.risk} (${band})**`, "",
      `| | |\n|---|---|\n| Service | \`${r.service}\` |\n| Occurrences | ${r.count} |\n| People affected | ${r.usersAffected} |\n| First seen | ${r.firstSeen.toISOString()} |\n| Last seen | ${r.lastSeen.toISOString()} |`, "",
      `**Policy:** ${policy}`, "", "### Latest occurrence (scrubbed — no personal data)", "```json", JSON.stringify(JSON.parse(r.sample), null, 2).slice(0, 6000), "```",
      events.length ? `\n### Recent occurrences\n${events.map((e) => `- ${e.at.toISOString()} · release \`${e.release}\``).join("\n")}` : "",
      similar.length ? `\n### Similar problems fixed before\n${similar.map((s) => `- ${s.code}: ${s.title}${s.prUrl ? ` — ${s.prUrl}` : ""}${s.diagnosis ? `\n  > ${s.diagnosis.slice(0, 300)}` : ""}`).join("\n")}` : "",
      "", "---", `Branch for a fix: \`ai/bug-fix/${r.code}\` · see docs/AI_ENGINEER.md. Opened automatically by the Discover monitor.`,
    ].join("\n");
    try {
      const issue = await createIssue(`${r.code}: ${r.title}`, body, ["ai-engineer", "bug", `severity:${r.severity.toLowerCase()}`, `risk:${band.toLowerCase()}`, ...(band === "Critical" || band === "High" ? ["needs-human"] : [])]);
      await db.update(schema.opsIncidents).set({ githubIssue: issue.number }).where(eq(schema.opsIncidents.id, r.id));
      await opsAction("GITHUB_SYNC", "issue_opened", { incidentId: r.id, risk: r.risk, detail: { code: r.code, issue: issue.number } });
      opened++;
    } catch (e) { await opsAction("GITHUB_SYNC", "issue_failed", { incidentId: r.id, result: "FAILED", detail: { error: String((e as Error).message).slice(0, 200) } }); break; }
  }
  // 2) Approved proposals → an issue each.
  const approved = await db.select().from(schema.opsProposals).where(and(eq(schema.opsProposals.status, "APPROVED"), sql`${schema.opsProposals.githubIssue} is null`)).limit(10);
  for (const p of approved) {
    const issue = await createIssue(`${p.code}: ${p.title}`, [`**${p.code}** · approved feature proposal · risk ${p.risk} · size ${p.complexity}`, "", `**Problem:** ${p.problem}`, "", `**Expected benefit:** ${p.benefit}`, "", "**Evidence**", "```json", JSON.stringify(JSON.parse(p.evidence), null, 2), "```", "", `**Suggested changes:** ${p.changes}`, "", "---", `Branch: \`ai/feature/${p.code}\` · see docs/AI_ENGINEER.md. A person approved this proposal in Admin → Engineering.`].join("\n"), ["ai-engineer", "feature", "approved"]);
    await db.update(schema.opsProposals).set({ githubIssue: issue.number, status: "IN_PROGRESS" }).where(eq(schema.opsProposals.id, p.id));
    await opsAction("GITHUB_SYNC", "proposal_issue_opened", { proposalId: p.id, detail: { code: p.code, issue: issue.number } });
    opened++;
  }
  // 3) The engineer's PRs → incident/proposal status. Merged = fixed (the watchdog then judges the release).
  for (const pr of await aiPulls()) {
    const code = pr.head.ref.match(/(BUG-\d{4}-\d{6}|FEAT-\d{4}-\d{4})/)?.[1];
    if (!code) continue;
    const state = pr.merged_at ? "MERGED" : pr.state === "open" ? "OPEN" : "CLOSED";
    if (code.startsWith("BUG")) {
      const inc = await db.query.opsIncidents.findFirst({ where: eq(schema.opsIncidents.code, code) });
      if (!inc || (inc.prUrl === pr.html_url && inc.prState === state)) continue;
      const status = state === "MERGED" ? "FIXED" : state === "OPEN" ? "PR_OPEN" : inc.status === "PR_OPEN" ? "TRIAGED" : inc.status;
      await db.update(schema.opsIncidents).set({ prUrl: pr.html_url, prState: state, status, ...(state === "MERGED" ? { fixedAt: new Date(pr.merged_at!) } : {}) }).where(eq(schema.opsIncidents.id, inc.id));
      await opsAction("GITHUB_SYNC", `pr_${state.toLowerCase()}`, { incidentId: inc.id, risk: inc.risk, detail: { code, pr: pr.number, url: pr.html_url } });
      if (state === "MERGED" && inc.githubIssue) await closeIssue(inc.githubIssue, "completed").catch(() => {});
      updated++;
    } else {
      const p = await db.query.opsProposals.findFirst({ where: eq(schema.opsProposals.code, code) });
      if (!p || p.prUrl === pr.html_url && (state !== "MERGED" || p.status === "SHIPPED")) continue;
      await db.update(schema.opsProposals).set({ prUrl: pr.html_url, ...(state === "MERGED" ? { status: "SHIPPED" } : {}) }).where(eq(schema.opsProposals.id, p.id));
      await opsAction("GITHUB_SYNC", `feature_pr_${state.toLowerCase()}`, { proposalId: p.id, detail: { code, pr: pr.number } });
      updated++;
    }
  }
  // 4) The engineer's written diagnosis (issue comment) → shown on the incident in Admin → Engineering.
  for (const r of await db.select().from(schema.opsIncidents).where(and(isNotNull(schema.opsIncidents.githubIssue), sql`${schema.opsIncidents.diagnosis} is null`, inArray(schema.opsIncidents.status, ["NEW", "TRIAGED", "PR_OPEN", "REGRESSED"]))).limit(10)) {
    const text = await aiDiagnosis(r.githubIssue!).catch(() => null);
    if (!text) continue;
    await db.update(schema.opsIncidents).set({ diagnosis: text, ...(r.status === "NEW" ? { status: "TRIAGED" } : {}) }).where(eq(schema.opsIncidents.id, r.id));
    await opsAction("AI_ENGINEER", "diagnosis_posted", { incidentId: r.id, risk: r.risk, detail: { code: r.code, issue: r.githubIssue } });
    updated++;
  }
  // 5) A fixed incident that came back → say so on its (closed) issue.
  for (const r of await db.select().from(schema.opsIncidents).where(and(eq(schema.opsIncidents.status, "REGRESSED"), isNotNull(schema.opsIncidents.githubIssue))).limit(10)) {
    const done = await db.query.opsActions.findFirst({ where: and(eq(schema.opsActions.incidentId, r.id), eq(schema.opsActions.action, "regression_commented"), gte(schema.opsActions.at, r.fixedAt ?? new Date(0))) });
    if (done) continue;
    await commentIssue(r.githubIssue!, `⚠️ ${r.code} happened again after the fix (last seen ${r.lastSeen.toISOString()}, ${r.count} times in total). Re-opening for the AI engineer.`).catch(() => {});
    await opsAction("GITHUB_SYNC", "regression_commented", { incidentId: r.id, detail: { code: r.code } });
  }
  return { opened, updated };
}
