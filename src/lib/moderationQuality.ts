// Moderation quality: is our automated screening right, and are people reviewing in time?
// Pure functions over rows so they can be unit tested; Admin → Privacy & compliance shows the result.

export type QReport = { category: string; automated: boolean; status: string; priority: string; createdAt: Date; resolvedAt: Date | null; dueAt: string; overdue: boolean };
export type QDecision = { id: string; system: string; kind: string };
export type QAppeal = { kind: string; refId: string | null; status: string };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

/**
 * Per automated-screening category: of the reports a person has already looked at, how many led to action
 * (precision) and how many were dismissed (false positives). A falling precision means a rule is too broad.
 */
export function screeningPrecision(reports: QReport[]) {
  const by = new Map<string, { category: string; filed: number; actioned: number; dismissed: number; open: number }>();
  for (const r of reports.filter((x) => x.automated)) {
    const e = by.get(r.category) ?? { category: r.category, filed: 0, actioned: 0, dismissed: 0, open: 0 };
    e.filed++;
    if (r.status === "ACTIONED") e.actioned++; else if (r.status === "DISMISSED") e.dismissed++; else e.open++;
    by.set(r.category, e);
  }
  return [...by.values()].map((e) => ({ ...e, precisionPct: pct(e.actioned, e.actioned + e.dismissed), falsePositivePct: pct(e.dismissed, e.actioned + e.dismissed) }))
    .sort((a, b) => b.filed - a.filed);
}

/** Per automated system: decisions made, appealed, and overturned on appeal. */
export function appealOverturns(decisions: QDecision[], appeals: QAppeal[]) {
  const sys = new Map(decisions.map((d) => [d.id, d.system]));
  const by = new Map<string, { system: string; decisions: number; appealed: number; overturned: number }>();
  for (const d of decisions) {
    const e = by.get(d.system) ?? { system: d.system, decisions: 0, appealed: 0, overturned: 0 };
    e.decisions++; by.set(d.system, e);
  }
  const human = { system: "staff decisions", decisions: 0, appealed: 0, overturned: 0 };
  for (const a of appeals) {
    const s = a.refId ? sys.get(a.refId) : undefined;
    const e = s ? by.get(s)! : human;
    e.appealed++;
    if (a.status === "OVERTURNED") e.overturned++;
  }
  const rows = [...by.values()];
  if (human.appealed) rows.push(human);
  return rows.map((e) => ({ ...e, overturnPct: pct(e.overturned, e.appealed) })).sort((a, b) => b.decisions - a.decisions);
}

/** Review times against the targets, by priority. */
export function reviewTimes(reports: QReport[]) {
  const out: Record<string, { priority: string; open: number; overdue: number; reviewed: number; onTime: number; medianHours: number | null }> = {};
  for (const p of ["CRITICAL", "HIGH", "MEDIUM", "LOW"]) {
    const rs = reports.filter((r) => r.priority === p);
    const done = rs.filter((r) => r.resolvedAt);
    const hours = done.map((r) => (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 3600_000).sort((a, b) => a - b);
    out[p] = {
      priority: p, open: rs.filter((r) => r.status === "OPEN").length, overdue: rs.filter((r) => r.overdue).length, reviewed: done.length,
      onTime: done.filter((r) => r.resolvedAt!.getTime() <= new Date(r.dueAt).getTime()).length,
      medianHours: hours.length ? Math.round(hours[Math.floor((hours.length - 1) / 2)] * 10) / 10 : null,
    };
  }
  return Object.values(out);
}
