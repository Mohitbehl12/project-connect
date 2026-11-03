import "server-only";
import { createHash, createHmac } from "node:crypto";
import { and, count, desc, eq, gte, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";

// Operations core: turns errors and odd behaviour into numbered incidents, keeps per-route request metrics,
// and writes an append-only trail of what the monitoring system and the AI engineer did.
//
// Privacy: nothing captured here may identify a member. No request bodies, cookies, tokens, emails or phone
// numbers; user ids are stored only as a keyed hash; messages are scrubbed before they are stored or sent on.

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentKind = "SERVER_ERROR" | "CLIENT_ERROR" | "ANOMALY" | "PERFORMANCE" | "SECURITY" | "DATA_QUALITY" | "UPTIME" | "DEPLOY" | "PAYMENT" | "USER_REPORT";
export const RELEASE = (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? "dev").slice(0, 12);

// ---- scrubbing ------------------------------------------------------------------------------------------------
const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>"],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<token>"], // JWT
  [/\b(rzp|sk|pk|re|whsec|ghp|gho|github_pat)_[A-Za-z0-9_]{8,}/g, "<secret>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ":id"],
  [/\+?\d[\d\s-]{8,}\d/g, "<number>"],
  [/\b[A-Za-z0-9_-]{32,}\b/g, "<token>"],
];
export function scrub(s: unknown, max = 500): string {
  let t = String(s ?? "").slice(0, 4000);
  for (const [re, rep] of PATTERNS) t = t.replace(re, rep);
  return t.slice(0, max);
}

/** /api/matches/6f0c…/messages → /api/matches/:id/messages */
export function routeKey(pathname: string) {
  return pathname.split("?")[0].replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}|\/[0-9a-f]{12}(?=\/|$)|\/\d{2,}(?=\/|$)|\/[A-Za-z0-9_-]{20,}(?=\/|$)/gi, "/:id").slice(0, 120);
}

/** Top frames of a stack, as project-relative file:line — enough to find the code, no data. */
export function stackTop(stack: unknown, frames = 6) {
  return String(stack ?? "").split("\n").filter((l) => /^\s*at /.test(l) || /@/.test(l)).slice(0, frames)
    .map((l) => scrub(l.trim().replace(/\(?(\/[^\s()]*\/)?(project-connect|app|src|\.next)\//, "$2/").replace(/^at /, ""), 160));
}

/** Same problem → same fingerprint: digits, ids and quoted values are blanked so variants group together. */
export function fingerprint(kind: string, service: string, message: string) {
  const norm = scrub(message, 300).toLowerCase().replace(/(["'`]).*?\1/g, "'…'").replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  return createHash("sha256").update(`${kind}|${service}|${norm}`).digest("hex").slice(0, 24);
}

const userHash = (userId: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "ops").update(`ops:${userId}`).digest("hex").slice(0, 16);

// ---- severity and risk ----------------------------------------------------------------------------------------
const SENSITIVE = /(auth|login|token|refresh|security|totp|password|billing|payment|checkout|subscription|webhook|ads\/topups|refund|privacy|admin)/;
const CORE = /(discovery|explore|likes|matches|messages|me$|profile|onboarding|calls?|call-requests)/;

export function severityFor(kind: IncidentKind, service: string, hint?: Severity): Severity {
  if (hint) return hint;
  if (kind === "SECURITY" || kind === "UPTIME") return "CRITICAL";
  if (kind === "PAYMENT" || kind === "DEPLOY") return "HIGH";
  if (kind === "SERVER_ERROR") return SENSITIVE.test(service) || CORE.test(service) ? "HIGH" : "MEDIUM";
  if (kind === "CLIENT_ERROR") return CORE.test(service) ? "MEDIUM" : "LOW";
  if (kind === "DATA_QUALITY") return "MEDIUM";
  return "MEDIUM";
}

/**
 * Risk 0–100 decides what the AI engineer may do: 0–20 low (fix + PR), 21–50 medium (PR, human approval),
 * 51–80 high (diagnosis + draft PR only), 81–100 critical (no code; alert people).
 */
export function riskScore(sev: Severity, service: string, usersAffected = 0, count = 1) {
  let r = { LOW: 10, MEDIUM: 35, HIGH: 60, CRITICAL: 90 }[sev];
  if (SENSITIVE.test(service)) r += 15;
  if (usersAffected >= 10) r += 10;
  else if (usersAffected >= 3) r += 5;
  if (count >= 100) r += 5;
  return Math.max(0, Math.min(100, r));
}
export const riskBand = (r: number) => (r <= 20 ? "Low" : r <= 50 ? "Medium" : r <= 80 ? "High" : "Critical");

// ---- incidents ------------------------------------------------------------------------------------------------
export type IncidentInput = {
  kind: IncidentKind; service: string; title: string; message?: string; stack?: unknown; severity?: Severity;
  context?: Record<string, unknown>; userId?: string | null; release?: string; fingerprintKey?: string;
};

const recent = new Map<string, { t: number; n: number }>();

async function nextCode() {
  const year = new Date().getUTCFullYear();
  const [{ n }] = await db.select({ n: count() }).from(schema.opsIncidents).where(like(schema.opsIncidents.code, `BUG-${year}-%`));
  return `BUG-${year}-${String(n + 1).padStart(6, "0")}`;
}

/** Records an occurrence. Never throws — monitoring must not break the request it is watching. */
export async function recordIncident(i: IncidentInput) {
  try {
    const service = i.service.slice(0, 120);
    const fp = i.fingerprintKey ?? fingerprint(i.kind, service, i.message ?? i.title);
    const sev = severityFor(i.kind, service, i.severity);
    const sample = JSON.stringify({ message: scrub(i.message ?? i.title), stack: i.stack ? stackTop(i.stack) : undefined, ...sanitizeContext(i.context), release: i.release ?? RELEASE }).slice(0, 4000);
    const who = i.userId ? userHash(i.userId) : null;
    // Burst control: the same problem 30 times in a minute is counted, but only the first ones are written in full.
    const now = Date.now(), r = recent.get(fp);
    const burst = r && now - r.t < 60_000 && r.n >= 30;
    recent.set(fp, r && now - r.t < 60_000 ? { t: r.t, n: r.n + 1 } : { t: now, n: 1 });
    const existing = await db.query.opsIncidents.findFirst({ where: eq(schema.opsIncidents.fingerprint, fp) });
    if (existing) {
      const newUser = who ? !(await db.query.opsIncidentEvents.findFirst({ where: and(eq(schema.opsIncidentEvents.incidentId, existing.id), eq(schema.opsIncidentEvents.user, who)) })) : false;
      const regressed = existing.status === "FIXED" && existing.fixedAt && now - existing.fixedAt.getTime() > 10 * 60_000;
      await db.update(schema.opsIncidents).set({
        count: sql`${schema.opsIncidents.count} + 1`, lastSeen: new Date(), sample,
        usersAffected: newUser ? sql`${schema.opsIncidents.usersAffected} + 1` : schema.opsIncidents.usersAffected,
        ...(regressed ? { status: "REGRESSED" } : {}),
      }).where(eq(schema.opsIncidents.id, existing.id));
      if (regressed) await opsAction("MONITOR", "incident_regressed", { incidentId: existing.id, risk: existing.risk, detail: { code: existing.code } });
      if (!burst) await db.insert(schema.opsIncidentEvents).values({ incidentId: existing.id, user: who, release: i.release ?? RELEASE, context: sample });
      return existing;
    }
    const risk = riskScore(sev, service, who ? 1 : 0);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const [row] = await db.insert(schema.opsIncidents).values({ code: await nextCode(), kind: i.kind, fingerprint: fp, title: scrub(i.title, 160), service, severity: sev, risk, usersAffected: who ? 1 : 0, sample }).returning();
        await db.insert(schema.opsIncidentEvents).values({ incidentId: row.id, user: who, release: i.release ?? RELEASE, context: sample });
        await opsAction("MONITOR", "incident_opened", { incidentId: row.id, risk, detail: { code: row.code, kind: i.kind, severity: sev, service } });
        console.error(`[incident] ${JSON.stringify({ code: row.code, kind: i.kind, severity: sev, risk, service, title: row.title })}`);
        return row;
      } catch (e) {
        const again = await db.query.opsIncidents.findFirst({ where: eq(schema.opsIncidents.fingerprint, fp) });
        if (again) return again; // another request opened it first
        if (attempt === 2) throw e;
      }
    }
  } catch (e) {
    console.error("[ops] could not record incident", (e as Error).message);
  }
  return null;
}

/** Keeps only operational, non-identifying fields. */
function sanitizeContext(c?: Record<string, unknown>) {
  if (!c) return {};
  const allowed = ["method", "path", "route", "status", "ms", "platform", "screen", "browser", "appVersion", "metric", "value", "threshold", "baseline", "window", "detail", "rows", "kind"];
  const out: Record<string, unknown> = {};
  for (const k of allowed) if (c[k] !== undefined) out[k] = typeof c[k] === "string" ? scrub(c[k], 300) : c[k];
  return out;
}

export async function captureServerError(e: unknown, req: Request, userId?: string | null, ms?: number) {
  const err = e as Error;
  const path = (() => { try { return new URL(req.url).pathname; } catch { return "unknown"; } })();
  const service = `${req.method} ${routeKey(path)}`;
  await recordIncident({ kind: "SERVER_ERROR", service, title: `${service}: ${scrub(err?.message ?? String(e), 120)}`, message: err?.message ?? String(e), stack: err?.stack,
    context: { method: req.method, route: routeKey(path), status: 500, ms }, userId });
}

// ---- audit trail ----------------------------------------------------------------------------------------------
export async function opsAction(agent: string, action: string, o: { incidentId?: string; proposalId?: string; risk?: number; result?: string; detail?: unknown } = {}) {
  try {
    await db.insert(schema.opsActions).values({ agent, action, incidentId: o.incidentId ?? null, proposalId: o.proposalId ?? null, risk: o.risk ?? null, result: o.result ?? "OK", detail: JSON.stringify(o.detail ?? {}).slice(0, 4000) });
  } catch (e) { console.error("[ops] action not recorded", (e as Error).message); }
}

// ---- request metrics ------------------------------------------------------------------------------------------
export const OPS_BANDS = [100, 250, 500, 1000, 2500, 5000, Infinity];
type Acc = { count: number; errors: number; rejected: number; totalMs: number; maxMs: number; hist: number[] };
const acc = new Map<string, Acc>();
let timer: NodeJS.Timeout | null = null;
export const bucketOf = (d = new Date()) => { const m = Math.floor(d.getUTCMinutes() / 5) * 5; return `${d.toISOString().slice(0, 14)}${String(m).padStart(2, "0")}`; };

export function recordRequest(route: string, status: number, ms: number) {
  if (process.env.OPS_METRICS === "false") return;
  const key = `${bucketOf()}|${route}`;
  const a = acc.get(key) ?? { count: 0, errors: 0, rejected: 0, totalMs: 0, maxMs: 0, hist: OPS_BANDS.map(() => 0) };
  a.count++; if (status >= 500) a.errors++; else if (status >= 400) a.rejected++;
  a.totalMs += ms; a.maxMs = Math.max(a.maxMs, ms);
  a.hist[OPS_BANDS.findIndex((b) => ms < b)]++;
  acc.set(key, a);
  if (!timer) { timer = setInterval(() => { flushMetrics().catch(() => {}); }, 60_000); timer.unref?.(); }
}

export async function flushMetrics() {
  const items = [...acc.entries()];
  acc.clear();
  for (const [key, a] of items) {
    const [bucket, route] = key.split("|");
    const cur = await db.query.opsMetrics.findFirst({ where: and(eq(schema.opsMetrics.bucket, bucket), eq(schema.opsMetrics.route, route)) });
    const prevHist: number[] = cur ? JSON.parse(cur.hist || "[]") : [];
    const hist = a.hist.map((v, i) => v + (prevHist[i] ?? 0));
    await db.insert(schema.opsMetrics).values({ bucket, route, count: a.count, errors: a.errors, rejected: a.rejected, totalMs: a.totalMs, maxMs: a.maxMs, hist: JSON.stringify(hist) })
      .onConflictDoUpdate({ target: [schema.opsMetrics.bucket, schema.opsMetrics.route], set: {
        count: sql`${schema.opsMetrics.count} + ${a.count}`, errors: sql`${schema.opsMetrics.errors} + ${a.errors}`, rejected: sql`${schema.opsMetrics.rejected} + ${a.rejected}`,
        totalMs: sql`${schema.opsMetrics.totalMs} + ${a.totalMs}`, maxMs: sql`max(${schema.opsMetrics.maxMs}, ${a.maxMs})`, hist: JSON.stringify(hist) } });
  }
  return items.length;
}

/**
 * Outcome of a background integration (email, push, SMS, payment webhook…). Counted like a request under
 * "SIGNAL <name>" so the monitor can spot a failure rate going up. Never throws.
 */
export function recordSignal(name: string, ok: boolean, ms = 0) {
  try { recordRequest(`SIGNAL ${name}`, ok ? 200 : 500, ms); } catch { /* best effort */ }
}

/** Counts a product event for the feature scout (e.g. a search that found nobody). Not an error. */
export function recordUsage(name: string) {
  try { recordRequest(`USAGE ${name}`, 200, 0); } catch { /* best effort */ }
}

/** Approximate percentile from the latency histogram (linear inside a band; the open band reports its floor). */
export function percentile(hist: number[], p: number) {
  const total = hist.reduce((s, v) => s + v, 0);
  if (!total) return 0;
  let seen = 0;
  for (let i = 0; i < hist.length; i++) {
    if (seen + hist[i] >= total * p) {
      const lo = i ? OPS_BANDS[i - 1] : 0, hi = OPS_BANDS[i] === Infinity ? lo * 2 : OPS_BANDS[i];
      return Math.round(lo + ((total * p - seen) / Math.max(1, hist[i])) * (hi - lo));
    }
    seen += hist[i];
  }
  return OPS_BANDS[OPS_BANDS.length - 2];
}

/** Totals per route since a time (rolled up from the 5-minute buckets). */
export async function metricsSince(since: Date) {
  const rows = await db.select().from(schema.opsMetrics).where(gte(schema.opsMetrics.bucket, bucketOf(since))).orderBy(desc(schema.opsMetrics.bucket));
  const by = new Map<string, Acc>();
  for (const r of rows) {
    const a = by.get(r.route) ?? { count: 0, errors: 0, rejected: 0, totalMs: 0, maxMs: 0, hist: OPS_BANDS.map(() => 0) };
    a.count += r.count; a.errors += r.errors; a.rejected += r.rejected; a.totalMs += r.totalMs; a.maxMs = Math.max(a.maxMs, r.maxMs);
    (JSON.parse(r.hist || "[]") as number[]).forEach((v, i) => { a.hist[i] += v; });
    by.set(r.route, a);
  }
  return [...by.entries()].map(([route, a]) => ({ route, ...a, avgMs: a.count ? Math.round(a.totalMs / a.count) : 0, p95: percentile(a.hist, 0.95), errorRate: a.count ? a.errors / a.count : 0 }));
}
