"use client";
import { useEffect, useState } from "react";
import { AdminShell, AdminTitle, useStaff } from "@/components/AdminShell";
import { Alert, Modal, Spinner } from "@/components/ui";
import { api, timeAgo, useApi } from "@/lib/client";

// Admin → Engineering: the 24×7 monitor, incidents, releases, improvement proposals and the AI engineer's trail.
// Aggregates and scrubbed error samples only — nothing here identifies a member.

type Check = { ok: boolean; detail: string };
type Overview = {
  release: string; totals: { requests: number; errors: number; rejected: number; p95: number };
  series: { hour: string; requests: number; errors: number; p95: number }[];
  slowest: { route: string; count: number; p95: number; avgMs: number }[]; failing: { route: string; count: number; errors: number }[];
  signals: { name: string; count: number; failed: number }[];
  health: null | { at: string; rssMb: number; heapMb: number; load1: number; cpus: number; diskFreePct: number | null; dbMs: number; checks: Record<string, Check> };
  open: { severity: string; status: string; n: number }[]; activity: { agent: string; action: string; n: number }[]; fixedThisWeek: number;
  deploys: { id: string; commit: string; startedAt: string; status: string; verdict: any; decidedAt: string | null }[];
  proposals: { status: string; n: number }[]; ci: null | { name: string; event: string; status: string; conclusion: string | null; branch: string; url: string; at: string }[];
  lastRuns: Record<string, string | null>; setup: { id: string; label: string; ok: boolean; detail: string }[];
};
type Incident = { code: string; kind: string; title: string; service: string; severity: string; risk: number; status: string; count: number; usersAffected: number; firstSeen: string; lastSeen: string; prUrl: string | null; githubIssue: number | null };

const TABS = { overview: "Overview", health: "Product health", feedback: "Feedback", incidents: "Incidents", releases: "Releases", proposals: "Improvements", trail: "Activity trail", settings: "Settings" } as const;
type Tab = keyof typeof TABS;
const SEV_TONE: Record<string, string> = { CRITICAL: "bg-rose text-white", HIGH: "bg-rose/15 text-rose", MEDIUM: "bg-marigold/25 text-ink", LOW: "bg-paper-sunk text-ink-soft" };
const STATUS_LABEL: Record<string, string> = { NEW: "New", TRIAGED: "Looked at", PR_OPEN: "Fix proposed (PR)", FIXED: "Fixed", REGRESSED: "Came back", WONT_FIX: "Won't fix", IGNORED: "Ignored" };
const n = (v: number) => v.toLocaleString();

function Sev({ s }: { s: string }) { return <span className={`rounded-pill px-2 py-0.5 text-xs font-bold ${SEV_TONE[s] ?? ""}`}>{s.toLowerCase()}</span>; }

function Engineering() {
  const staff = useStaff();
  const manage = staff.permissions.includes("ops.manage");
  const [tab, setTab] = useState<Tab>("overview");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab") as Tab | null;
    if (t && t in TABS) setTab(t);
    const inc = p.get("incident");
    if (inc) { setTab("incidents"); setOpen(inc); }
  }, []);
  function go(t: Tab) { setTab(t); try { history.replaceState(null, "", `?tab=${t}`); } catch { /* ignore */ } }
  return (
    <>
      <AdminTitle title="Engineering" sub="24×7 monitoring, incidents, releases and improvement ideas. The AI engineer proposes fixes as pull requests; a person approves every merge." />
      <div role="tablist" aria-label="Engineering sections" className="mb-5 flex flex-wrap gap-2">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => go(t)} className={`rounded-pill px-4 py-1.5 text-sm font-semibold ${tab === t ? "bg-ink text-paper" : "bg-paper-sunk text-ink-soft hover:text-ink"}`}>{TABS[t]}</button>
        ))}
      </div>
      {tab === "overview" && <OverviewTab manage={manage} onIncidents={() => go("incidents")} />}
      {tab === "health" && <HealthTab />}
      {tab === "feedback" && <FeedbackTab />}
      {tab === "incidents" && <IncidentsTab manage={manage} open={open} setOpen={setOpen} />}
      {tab === "releases" && <ReleasesTab manage={manage} />}
      {tab === "proposals" && <ProposalsTab manage={manage} />}
      {tab === "trail" && <TrailTab />}
      {tab === "settings" && <SettingsTab canEdit={staff.permissions.includes("config.edit")} />}
    </>
  );
}

function Tile({ label, value, tone, sub }: { label: string; value: string; tone?: "ok" | "bad" | "warn"; sub?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone === "bad" ? "text-rose" : tone === "warn" ? "text-marigold-deep" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}

function Bars({ series }: { series: Overview["series"] }) {
  if (!series.length) return <p className="text-sm text-ink-soft">No traffic recorded yet.</p>;
  const max = Math.max(...series.map((s) => s.requests), 1);
  return (
    <div>
      <div className="flex h-32 items-end gap-1" role="img" aria-label={`Requests per hour for the last ${series.length} hours; ${series.reduce((s, x) => s + x.errors, 0)} server errors in total.`}>
        {series.map((s) => (
          <div key={s.hour} className="group relative flex flex-1 flex-col justify-end" style={{ height: "100%" }} title={`${s.hour.slice(11, 16)} UTC · ${n(s.requests)} requests · ${s.errors} errors · p95 ${s.p95} ms`}>
            <div className="w-full rounded-t-sm bg-berry/70" style={{ height: `${Math.max(2, (s.requests / max) * 100)}%` }} />
            {s.errors > 0 && <div className="absolute bottom-0 w-full bg-rose" style={{ height: `${Math.max(3, (s.errors / max) * 100)}%` }} />}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink-soft"><span>{series[0].hour.slice(11, 16)} UTC</span><span>now</span></div>
      <p className="mt-2 text-xs text-ink-soft"><span className="mr-1 inline-block h-2 w-3 bg-berry/70" />requests <span className="ml-3 mr-1 inline-block h-2 w-3 bg-rose" />server errors</p>
    </div>
  );
}

function OverviewTab({ manage, onIncidents }: { manage: boolean; onIncidents: () => void }) {
  const q = useApi<Overview>("/api/admin/ops");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (q.error) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  const d = q.data;
  const errRate = d.totals.requests ? (d.totals.errors / d.totals.requests) * 100 : 0;
  const openCount = d.open.reduce((s, o) => s + o.n, 0), critical = d.open.filter((o) => o.severity === "CRITICAL").reduce((s, o) => s + o.n, 0);
  const act = (agent: string, action?: string) => d.activity.filter((a) => a.agent === agent && (!action || a.action === action)).reduce((s, a) => s + a.n, 0);
  async function runNow() {
    setBusy(true); setMsg(null);
    try { const r = await api<{ anomalies: string[]; alerts: number }>("/api/admin/ops/run", { method: "POST" }); setMsg(r.anomalies.length ? `Checked. Found: ${r.anomalies.join(", ")}.` : "Checked. Nothing above the thresholds."); q.reload(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-5">
      {d.setup.some((s) => !s.ok) && (
        <section className="panel p-5">
          <h2 className="text-lg font-bold">Setup</h2>
          <ul className="mt-2 divide-y divide-mist text-sm">
            {d.setup.map((s) => <li key={s.id} className="flex gap-3 py-2"><span aria-hidden className={s.ok ? "text-sage" : "text-ink-faint"}>{s.ok ? "✓" : "○"}</span><span><strong>{s.label}</strong><br /><span className="text-ink-soft">{s.detail}</span></span></li>)}
          </ul>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Requests (24 h)" value={n(d.totals.requests)} sub={`release ${d.release}`} />
        <Tile label="Server errors" value={`${errRate.toFixed(2)}%`} tone={errRate > 2 ? "bad" : errRate > 0.5 ? "warn" : "ok"} sub={`${n(d.totals.errors)} errors`} />
        <Tile label="Slowest 5%" value={`${n(d.totals.p95)} ms`} tone={d.totals.p95 > 2000 ? "warn" : "ok"} sub="95% of requests are faster" />
        <button className="text-left" onClick={onIncidents}><Tile label="Open incidents" value={String(openCount)} tone={critical ? "bad" : openCount ? "warn" : "ok"} sub={critical ? `${critical} critical` : `${d.fixedThisWeek} fixed this week`} /></button>
      </div>
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Last 24 hours</h2>
          {manage && <button className="btn-outline px-3 py-1.5 text-sm" onClick={runNow} disabled={busy}>{busy ? "Checking…" : "Check now"}</button>}
        </div>
        {msg && <p className="mt-2 text-sm" role="status">{msg}</p>}
        <div className="mt-3"><Bars series={d.series} /></div>
      </section>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-lg font-bold">Services</h2>
          {d.health ? (
            <>
              <p className="text-xs text-ink-soft">Checked {timeAgo(d.health.at)} · memory {d.health.rssMb} MB · database {d.health.dbMs} ms · load {d.health.load1}/{d.health.cpus} CPU{d.health.diskFreePct !== null ? ` · disk ${d.health.diskFreePct}% free` : ""}</p>
              <ul className="mt-2 divide-y divide-mist text-sm">
                {Object.entries(d.health.checks).map(([k, c]) => <li key={k} className="flex gap-3 py-1.5"><span aria-hidden className={c.ok ? "text-sage" : "text-rose"}>{c.ok ? "✓" : "✗"}</span><span className="flex-1 capitalize">{k}</span><span className="text-ink-soft">{c.detail}</span></li>)}
              </ul>
            </>
          ) : <p className="mt-2 text-sm text-ink-soft">The monitor hasn't run yet.</p>}
          {d.signals.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-bold">Integrations (24 h)</h3>
              <ul className="mt-1 text-sm">{d.signals.map((s) => <li key={s.name} className="flex justify-between py-0.5"><span>{s.name.replace(/_/g, " ")}</span><span className={s.failed ? "text-rose" : "text-ink-soft"}>{s.failed} of {n(s.count)} failed</span></li>)}</ul>
            </>
          )}
        </section>
        <section className="panel p-5">
          <h2 className="text-lg font-bold">AI engineering (7 days)</h2>
          <ul className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <li><strong className="text-xl">{act("MONITOR", "alert_sent")}</strong><br /><span className="text-ink-soft">alerts sent</span></li>
            <li><strong className="text-xl">{act("GITHUB_SYNC", "issue_opened")}</strong><br /><span className="text-ink-soft">issues opened</span></li>
            <li><strong className="text-xl">{act("GITHUB_SYNC", "pr_open")}</strong><br /><span className="text-ink-soft">fix PRs proposed</span></li>
            <li><strong className="text-xl">{act("GITHUB_SYNC", "pr_merged")}</strong><br /><span className="text-ink-soft">fixes merged (by a person)</span></li>
            <li><strong className="text-xl">{act("FEATURE_SCOUT")}</strong><br /><span className="text-ink-soft">improvement ideas</span></li>
            <li><strong className="text-xl">{act("WATCHDOG", "rollback") + act("ADMIN", "manual_rollback")}</strong><br /><span className="text-ink-soft">rollbacks</span></li>
          </ul>
          {d.ci && (
            <>
              <h3 className="mt-4 text-sm font-bold">Recent test runs (GitHub Actions)</h3>
              <ul className="mt-1 text-sm">
                {d.ci.slice(0, 6).map((r, i) => <li key={i} className="flex justify-between gap-2 py-0.5"><a className="truncate underline" href={r.url} target="_blank" rel="noreferrer">{r.name} · {r.branch}</a><span className={r.conclusion === "success" ? "text-sage" : r.conclusion ? "text-rose" : "text-ink-soft"}>{r.conclusion ?? r.status}</span></li>)}
              </ul>
            </>
          )}
        </section>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <RouteList title="Slowest routes (24 h)" rows={d.slowest.map((r) => [r.route, `${n(r.p95)} ms`, `${n(r.count)} req`])} empty="Not enough traffic yet." />
        <RouteList title="Routes with server errors (24 h)" rows={d.failing.map((r) => [r.route, `${r.errors} errors`, `${n(r.count)} req`])} empty="No server errors. 🎉" />
      </div>
    </div>
  );
}

function RouteList({ title, rows, empty }: { title: string; rows: [string, string, string][]; empty: string }) {
  return (
    <section className="panel p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {rows.length ? <ul className="mt-2 divide-y divide-mist text-sm">{rows.map(([a, b, c]) => <li key={a} className="flex gap-2 py-1.5"><code className="flex-1 truncate text-xs">{a}</code><span>{b}</span><span className="w-20 text-right text-ink-soft">{c}</span></li>)}</ul> : <p className="mt-2 text-sm text-ink-soft">{empty}</p>}
    </section>
  );
}

function IncidentsTab({ manage, open, setOpen }: { manage: boolean; open: string | null; setOpen: (c: string | null) => void }) {
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("");
  const [q, setQ] = useState("");
  const list = useApi<{ incidents: Incident[] }>(`/api/admin/ops/incidents?status=${status}&severity=${severity}&q=${encodeURIComponent(q)}`);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open</option><option value="all">All</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input w-auto" aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">Any severity</option><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option>
        </select>
        <input className="input w-auto flex-1" type="search" placeholder="Search code, title or route" aria-label="Search incidents" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.error && <Alert tone="error">{list.error.message}</Alert>}
      {!list.data ? <Spinner /> : list.data.incidents.length === 0 ? <p className="panel p-6 text-center text-ink-soft">No incidents here.</p> : (
        <ul className="panel divide-y divide-mist">
          {list.data.incidents.map((i) => (
            <li key={i.code}>
              <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-paper-sunk" onClick={() => setOpen(i.code)}>
                <Sev s={i.severity} />
                <span className="font-mono text-xs text-ink-soft">{i.code}</span>
                <span className="min-w-0 flex-1 basis-60 font-semibold">{i.title}</span>
                <span className="text-xs text-ink-soft">{STATUS_LABEL[i.status] ?? i.status} · {n(i.count)}× · {i.usersAffected} people · {timeAgo(i.lastSeen)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <IncidentModal code={open} manage={manage} onClose={() => { setOpen(null); list.reload(); }} />}
    </>
  );
}

function IncidentModal({ code, manage, onClose }: { code: string; manage: boolean; onClose: () => void }) {
  const q = useApi<{ incident: any; events: any[]; actions: any[]; similar: any[] }>(`/api/admin/ops/incidents/${encodeURIComponent(code)}`);
  const [diag, setDiag] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function patch(body: object) {
    setErr(null);
    try { await api(`/api/admin/ops/incidents/${encodeURIComponent(code)}`, { method: "PATCH", body }); q.reload(); setDiag(null); }
    catch (e: any) { setErr(e.message); }
  }
  const i = q.data?.incident;
  return (
    <Modal open onClose={onClose} title={code}>
      {q.error ? <Alert tone="error">{q.error.message}</Alert> : !i ? <Spinner /> : (
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-base font-bold">{i.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2"><Sev s={i.severity} /><span>risk {i.risk} ({i.band})</span><span className="text-ink-soft">· {i.kind.replace(/_/g, " ").toLowerCase()} · {STATUS_LABEL[i.status] ?? i.status}</span></p>
            <p className="mt-1 text-ink-soft"><code>{i.service}</code> · {n(i.count)} times · {i.usersAffected} people · first {new Date(i.firstSeen).toLocaleString()} · last {timeAgo(i.lastSeen)}</p>
            <p className="mt-1 flex flex-wrap gap-3">{i.issueUrl && <a className="underline" href={i.issueUrl} target="_blank" rel="noreferrer">GitHub issue #{i.githubIssue}</a>}{i.prUrl && <a className="underline" href={i.prUrl} target="_blank" rel="noreferrer">Pull request ({(i.prState ?? "").toLowerCase()})</a>}</p>
          </div>
          {err && <Alert tone="error">{err}</Alert>}
          <div>
            <h3 className="font-bold">Diagnosis</h3>
            {diag === null ? (
              <p className="whitespace-pre-wrap text-ink-soft">{i.diagnosis || "None yet. The AI engineer writes one when it picks up the issue."}{manage && <> <button className="underline" onClick={() => setDiag(i.diagnosis ?? "")}>Edit</button></>}</p>
            ) : (
              <div className="space-y-2"><textarea className="input min-h-28" aria-label="Diagnosis" value={diag} onChange={(e) => setDiag(e.target.value)} maxLength={4000} /><div className="flex gap-2"><button className="btn-primary px-3 py-1.5 text-sm" onClick={() => patch({ diagnosis: diag })}>Save</button><button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setDiag(null)}>Cancel</button></div></div>
            )}
          </div>
          <div>
            <h3 className="font-bold">Latest occurrence <span className="font-normal text-ink-soft">(scrubbed)</span></h3>
            <pre className="mt-1 max-h-56 overflow-auto rounded-md bg-paper-sunk p-3 text-xs">{JSON.stringify(i.sample, null, 2)}</pre>
          </div>
          {q.data!.similar.length > 0 && (
            <div><h3 className="font-bold">Seen before</h3><ul className="mt-1 space-y-1">{q.data!.similar.map((s) => <li key={s.code}><span className="font-mono text-xs">{s.code}</span> {s.title} <span className="text-ink-soft">· {STATUS_LABEL[s.status] ?? s.status}</span>{s.prUrl && <> · <a className="underline" href={s.prUrl} target="_blank" rel="noreferrer">fix</a></>}</li>)}</ul></div>
          )}
          {q.data!.actions.length > 0 && (
            <div><h3 className="font-bold">History</h3><ul className="mt-1 space-y-0.5 text-xs text-ink-soft">{q.data!.actions.map((a) => <li key={a.id}>{new Date(a.at).toLocaleString()} · {a.agent.toLowerCase().replace(/_/g, " ")} · {a.action.replace(/_/g, " ")}{a.result !== "OK" ? ` · ${a.result}` : ""}</li>)}</ul></div>
          )}
          {manage && (
            <div className="flex flex-wrap gap-2 border-t border-mist pt-3">
              {i.status !== "TRIAGED" && <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => patch({ status: "TRIAGED" })}>Mark looked at</button>}
              {i.status !== "FIXED" && <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => { const note = prompt("What fixed it? (commit, setting, or note)"); if (note) patch({ status: "FIXED", note }); }}>Mark fixed…</button>}
              {i.status !== "WONT_FIX" && <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => { const note = prompt("Why won't this be fixed?"); if (note) patch({ status: "WONT_FIX", note }); }}>Won't fix…</button>}
              {i.status !== "IGNORED" && <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => patch({ status: "IGNORED", note: "noise" })}>Ignore (noise)</button>}
              {["FIXED", "WONT_FIX", "IGNORED"].includes(i.status) && <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => patch({ status: "NEW" })}>Reopen</button>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ReleasesTab({ manage }: { manage: boolean }) {
  const q = useApi<Overview>("/api/admin/ops");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (q.error) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  async function rollback() {
    const reason = prompt("Roll back to the previous healthy release. Why? (This is recorded.)");
    if (!reason) return;
    if (prompt("Type ROLL BACK to confirm.") !== "ROLL BACK") return;
    setMsg(null);
    try { const r = await api<{ to: string }>("/api/admin/ops/rollback", { body: { confirm: "ROLL BACK", reason } }); setMsg({ tone: "success", text: `Rollback started to ${r.to}. Render will switch over in a minute or two.` }); q.reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  const tone: Record<string, string> = { HEALTHY: "text-sage", WATCHING: "text-ink-soft", DEGRADED: "text-rose", ROLLED_BACK: "text-marigold-deep", ROLLBACK_FAILED: "text-rose" };
  return (
    <div className="space-y-4">
      <Alert tone="info">Every release is watched for its first hour. If server errors jump to three times the previous day's rate, serious new incidents appear, or the app starts crashing, the watchdog opens a critical incident, alerts you and{q.data.setup.find((s) => s.id === "rollback")?.ok ? " rolls back to the last healthy release." : " — once RENDER_API_KEY is set — rolls back to the last healthy release."}</Alert>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Releases</h2>{manage && <button className="btn-danger px-3 py-1.5 text-sm" onClick={rollback}>Roll back…</button>}</div>
        {q.data.deploys.length === 0 ? <p className="mt-2 text-sm text-ink-soft">No releases recorded yet (they're recorded on Render, not in development).</p> : (
          <ul className="mt-2 divide-y divide-mist text-sm">
            {q.data.deploys.map((d) => (
              <li key={d.id} className="py-2">
                <div className="flex flex-wrap gap-3"><code>{d.commit}</code><span className={`font-semibold ${tone[d.status] ?? ""}`}>{d.status.replace(/_/g, " ").toLowerCase()}</span><span className="text-ink-soft">started {new Date(d.startedAt).toLocaleString()}</span>{d.commit === q.data!.release && <span className="chip">live now</span>}</div>
                {d.verdict && <p className="text-xs text-ink-soft">after: {n(d.verdict.after.requests)} requests, {(d.verdict.after.rate * 100).toFixed(2)}% errors · before: {(d.verdict.baseline.rate * 100).toFixed(2)}% · new serious incidents: {d.verdict.newHighIncidents} · crashes: {d.verdict.crashes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type Proposal = { code: string; title: string; problem: string; benefit: string; evidence: Record<string, unknown>; changes: string; risk: string; complexity: string; status: string; source: string; issueUrl: string | null; prUrl: string | null; createdAt: string };
function ProposalsTab({ manage }: { manage: boolean }) {
  const [status, setStatus] = useState("PROPOSED");
  const q = useApi<{ proposals: Proposal[] }>(`/api/admin/ops/proposals?status=${status}`);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  async function decide(code: string, decision: string, risk: string) {
    const note = decision === "APPROVED" && risk === "HIGH" ? prompt("This is high risk. Why approve it? (recorded)") ?? "" : "";
    if (decision === "APPROVED" && risk === "HIGH" && !note) return;
    setErr(null);
    try { await api(`/api/admin/ops/proposals/${code}`, { method: "PATCH", body: { decision, note } }); q.reload(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="space-y-4">
      <Alert tone="info">Ideas come from how Discover is used (totals only — never one person's activity). Approving one opens a GitHub issue; the AI engineer builds it on a branch with tests and opens a pull request for you to review. Nothing ships without your merge.</Alert>
      <div className="flex flex-wrap gap-2">
        <select className="input w-auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PROPOSED">Waiting for a decision</option><option value="APPROVED">Approved</option><option value="IN_PROGRESS">Being built</option><option value="SHIPPED">Shipped</option><option value="REJECTED">Rejected</option><option value="">All</option>
        </select>
        {manage && <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setAdding(true)}>Add an idea…</button>}
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      {!q.data ? <Spinner /> : q.data.proposals.length === 0 ? <p className="panel p-6 text-center text-ink-soft">Nothing here yet. The scout looks once a day.</p> : q.data.proposals.map((p) => (
        <article key={p.code} className="panel p-5 text-sm">
          <div className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-xs text-ink-soft">{p.code}</span><h3 className="flex-1 text-base font-bold">{p.title}</h3><span className="chip">risk {p.risk.toLowerCase()} · size {p.complexity}</span></div>
          <p className="mt-2"><strong>Problem:</strong> {p.problem}</p>
          <p className="mt-1"><strong>Benefit:</strong> {p.benefit}</p>
          {p.changes && <p className="mt-1 text-ink-soft"><strong className="text-ink">Suggested change:</strong> {p.changes}</p>}
          <details className="mt-2"><summary className="cursor-pointer text-ink-soft">Evidence</summary><pre className="mt-1 overflow-auto rounded-md bg-paper-sunk p-2 text-xs">{JSON.stringify(p.evidence, null, 2)}</pre></details>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {p.issueUrl && <a className="underline" href={p.issueUrl} target="_blank" rel="noreferrer">GitHub issue</a>}
            {p.prUrl && <a className="underline" href={p.prUrl} target="_blank" rel="noreferrer">Pull request</a>}
            {manage && p.status === "PROPOSED" && <><button className="btn-primary px-3 py-1.5 text-sm" onClick={() => decide(p.code, "APPROVED", p.risk)}>Approve</button><button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => decide(p.code, "REJECTED", p.risk)}>Reject</button></>}
            {manage && (p.status === "REJECTED" || (p.status === "APPROVED" && !p.issueUrl)) && <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => decide(p.code, "PROPOSED", p.risk)}>Undo decision</button>}
          </div>
        </article>
      ))}
      {adding && <AddIdea onClose={() => { setAdding(false); q.reload(); }} />}
    </div>
  );
}

function AddIdea({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ title: "", problem: "", benefit: "", changes: "", risk: "LOW", complexity: "M" });
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setErr(null);
    try { await api("/api/admin/ops/proposals", { body: f }); onClose(); } catch (e: any) { setErr(e.message); }
  }
  const field = (k: keyof typeof f, label: string, area = false) => (
    <label className="block text-sm font-semibold">{label}{area ? <textarea className="input mt-1 min-h-20" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /> : <input className="input mt-1" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</label>
  );
  return (
    <Modal open onClose={onClose} title="Add an improvement idea">
      <div className="space-y-3">
        {err && <Alert tone="error">{err}</Alert>}
        {field("title", "Title")}{field("problem", "Problem", true)}{field("benefit", "Expected benefit", true)}{field("changes", "Suggested change (optional)", true)}
        <div className="flex gap-3">
          <label className="text-sm font-semibold">Risk<select className="input mt-1" value={f.risk} onChange={(e) => setF({ ...f, risk: e.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label>
          <label className="text-sm font-semibold">Size<select className="input mt-1" value={f.complexity} onChange={(e) => setF({ ...f, complexity: e.target.value })}><option>S</option><option>M</option><option>L</option></select></label>
        </div>
        <button className="btn-primary" onClick={save}>Add</button>
      </div>
    </Modal>
  );
}

function TrailTab() {
  const [agent, setAgent] = useState("");
  const [page, setPage] = useState(1);
  const q = useApi<{ actions: { id: string; at: string; agent: string; action: string; risk: number | null; result: string; detail: any }[] }>(`/api/admin/ops/actions?agent=${agent}&page=${page}`);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto" aria-label="Who" value={agent} onChange={(e) => { setAgent(e.target.value); setPage(1); }}>
          <option value="">Everyone</option><option value="MONITOR">Monitor</option><option value="WATCHDOG">Release watchdog</option><option value="GITHUB_SYNC">GitHub sync</option><option value="FEATURE_SCOUT">Feature scout</option><option value="AI_ENGINEER">AI engineer</option><option value="ADMIN">Staff</option>
        </select>
        <span className="text-xs text-ink-soft">Append-only: the app never edits or deletes this trail.</span>
      </div>
      {!q.data ? <Spinner /> : q.data.actions.length === 0 ? <p className="panel p-6 text-center text-ink-soft">Nothing recorded yet.</p> : (
        <ul className="panel divide-y divide-mist text-sm">
          {q.data.actions.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-3 px-4 py-2">
              <span className="w-40 text-ink-soft">{new Date(a.at).toLocaleString()}</span>
              <span className="w-32 font-semibold">{a.agent.toLowerCase().replace(/_/g, " ")}</span>
              <span className="flex-1">{a.action.replace(/_/g, " ")}{a.detail?.code ? ` · ${a.detail.code}` : ""}{a.risk !== null ? ` · risk ${a.risk}` : ""}</span>
              <span className={a.result === "OK" ? "text-sage" : "text-rose"}>{a.result.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">{page > 1 && <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setPage(page - 1)}>Newer</button>}{(q.data?.actions.length ?? 0) === 50 && <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setPage(page + 1)}>Older</button>}</div>
    </>
  );
}

type Change = { key: string; label: string; value: number | null; previous: number | null; changePct: number | null; better: boolean | null };
type Report = { week: string; generatedAt: string; changes: Change[]; improved: string[]; worse: string[]; newBugs: { code: string; title: string; severity: string; count: number }[]; complaints: { category: string; n: number }[]; feedback: { context: string; responses: number; score: number | null; unhappyPct: number }[]; nextUp: { code: string; title: string; risk: string }[] };
function HealthTab() {
  const [preview, setPreview] = useState(false);
  const q = useApi<{ report: Report | null; weeks?: string[] }>(`/api/admin/ops/reports${preview ? "?preview=1" : ""}`);
  if (q.error) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  const r = q.data.report;
  if (!r) return (
    <div className="panel p-6 text-center">
      <p className="text-ink-soft">The first weekly report is written on Monday after a full week of data.</p>
      <button className="btn-outline mt-3 px-3 py-1.5 text-sm" onClick={() => setPreview(true)}>Preview last week now</button>
    </div>
  );
  const fmt = (v: number | null) => (v === null ? "–" : v.toLocaleString());
  return (
    <div className="space-y-5">
      <Alert tone="info">Week of {r.week}{preview ? " (preview, not saved)" : ""}. Counts only — no member can be identified here. The north-star metric is the meaningful connection rate: matches where both people wrote at least 3 messages and 10 or more in all.</Alert>
      <section className="panel overflow-x-auto p-5">
        <h2 className="text-lg font-bold">Week of {r.week} vs the week before</h2>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-ink-soft"><th className="py-1 font-semibold">Measure</th><th className="py-1 text-right font-semibold">Week before</th><th className="py-1 text-right font-semibold">Week of {r.week}</th><th className="py-1 text-right font-semibold">Change</th></tr></thead>
          <tbody>{r.changes.map((c) => (
            <tr key={c.key} className="border-t border-mist"><td className={`py-1.5 ${c.key === "meaningfulConnectionRate" ? "font-bold" : ""}`}>{c.label}</td><td className="py-1.5 text-right text-ink-soft">{fmt(c.previous)}</td><td className="py-1.5 text-right">{fmt(c.value)}</td>
              <td className={`py-1.5 text-right ${c.better === true ? "text-sage" : c.better === false ? "text-rose" : "text-ink-soft"}`}>{c.changePct === null ? "–" : `${c.changePct > 0 ? "▲ +" : c.changePct < 0 ? "▼ " : ""}${c.changePct}%`}</td></tr>
          ))}</tbody>
        </table>
      </section>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="panel p-5"><h2 className="text-lg font-bold">What improved</h2>{r.improved.length ? <ul className="mt-2 list-disc pl-5 text-sm">{r.improved.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-2 text-sm text-ink-soft">Nothing moved up by 10% or more.</p>}</section>
        <section className="panel p-5"><h2 className="text-lg font-bold">What got worse</h2>{r.worse.length ? <ul className="mt-2 list-disc pl-5 text-sm">{r.worse.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-2 text-sm text-ink-soft">Nothing moved down by 10% or more.</p>}</section>
        <section className="panel p-5"><h2 className="text-lg font-bold">New bugs</h2>{r.newBugs.length ? <ul className="mt-2 space-y-1 text-sm">{r.newBugs.map((b) => <li key={b.code}><Sev s={b.severity} /> <span className="font-mono text-xs">{b.code}</span> {b.title} <span className="text-ink-soft">· {b.count}×</span></li>)}</ul> : <p className="mt-2 text-sm text-ink-soft">None.</p>}</section>
        <section className="panel p-5"><h2 className="text-lg font-bold">What members complain about</h2>
          {r.complaints.length ? <ul className="mt-2 text-sm">{r.complaints.map((c) => <li key={c.category} className="flex justify-between"><span>{c.category.replace(/_/g, " ").toLowerCase()}</span><span className="text-ink-soft">{c.n} reports</span></li>)}</ul> : <p className="mt-2 text-sm text-ink-soft">No reports.</p>}
          {r.feedback.filter((f) => f.unhappyPct >= 30).map((f) => <p key={f.context} className="mt-2 text-sm">Feedback on {f.context.toLowerCase()}: {f.unhappyPct}% unhappy of {f.responses}</p>)}
        </section>
      </div>
      <section className="panel p-5"><h2 className="text-lg font-bold">Next up (waiting for your decision)</h2>{r.nextUp.length ? <ul className="mt-2 text-sm">{r.nextUp.map((p) => <li key={p.code}><span className="font-mono text-xs">{p.code}</span> {p.title} <span className="text-ink-soft">· risk {p.risk.toLowerCase()}</span></li>)}</ul> : <p className="mt-2 text-sm text-ink-soft">No open ideas.</p>}</section>
      {!preview && <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setPreview(true)}>Recompute last week now (preview)</button>}
    </div>
  );
}

function FeedbackTab() {
  const [days, setDays] = useState(30);
  const q = useApi<{ contexts: { context: string; counts: Record<string, number>; responses: number; score: number | null; unhappyPct: number }[]; comments: { context: string; rating: string; comment: string; at: string; platform: string | null }[] }>(`/api/admin/ops/feedback?days=${days}`);
  const RL: Record<string, string> = { LOVE: "❤️ Love it", GOOD: "🙂 Good", OKAY: "😐 Okay", NEEDS_WORK: "🙁 Needs work", PROBLEM: "🚨 Problem" };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
        <span className="text-xs text-ink-soft">Comments are scrubbed of emails and numbers; who wrote them is never shown.</span>
      </div>
      {!q.data ? <Spinner /> : q.data.contexts.length === 0 ? <p className="panel p-6 text-center text-ink-soft">No feedback yet.</p> : (
        <section className="panel overflow-x-auto p-5">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ink-soft"><th className="py-1">Moment</th><th className="py-1 text-right">Responses</th><th className="py-1 text-right">Average (of 4)</th><th className="py-1 text-right">Unhappy</th></tr></thead>
            <tbody>{q.data.contexts.map((c) => <tr key={c.context} className="border-t border-mist"><td className="py-1.5 capitalize">{c.context.toLowerCase()}</td><td className="py-1.5 text-right">{c.responses}</td><td className="py-1.5 text-right">{c.score ?? "–"}</td><td className={`py-1.5 text-right ${c.unhappyPct >= 30 ? "text-rose" : ""}`}>{c.unhappyPct}%</td></tr>)}</tbody>
          </table>
        </section>
      )}
      {q.data && q.data.comments.length > 0 && (
        <ul className="panel divide-y divide-mist text-sm">{q.data.comments.map((c, i) => <li key={i} className="px-4 py-2"><span className="text-ink-soft">{new Date(c.at).toLocaleDateString()} · {c.context.toLowerCase()} · {RL[c.rating] ?? c.rating}</span><br />{c.comment}</li>)}</ul>
      )}
    </div>
  );
}

type OpsCfg = { "ops.thresholds": Record<string, number>; "ops.autoRollback": boolean; "ops.alertMinSeverity": string; "ops.issueMinSeverity": string };
const LABELS: Record<string, string> = {
  errorRatePct: "Server error rate that raises an incident (%)", minRequests: "…once there are at least this many requests in 15 min", p95Ms: "Slow-route budget (ms, 95% of requests)", p95SlowMs: "Budget for heavy routes like Discover (ms)",
  memoryPct: "Memory alarm (% of limit)", dbMs: "Database ping alarm (ms)", diskFreePct: "Disk-space alarm (% free)", failedLogins15m: "Failed sign-ins in 15 min (all)", failedLoginsPerIp15m: "Failed sign-ins in 15 min (one address)", signalFailPct: "Integration failure rate (%)",
};
function SettingsTab({ canEdit }: { canEdit: boolean }) {
  const q = useApi<{ config: OpsCfg }>("/api/admin/config");
  const [cfg, setCfg] = useState<OpsCfg | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => { if (q.data && !cfg) setCfg({ "ops.thresholds": q.data.config["ops.thresholds"], "ops.autoRollback": q.data.config["ops.autoRollback"], "ops.alertMinSeverity": q.data.config["ops.alertMinSeverity"], "ops.issueMinSeverity": q.data.config["ops.issueMinSeverity"] }); }, [q.data, cfg]);
  if (q.error) return <Alert tone="error">{q.error.message}</Alert>;
  if (!cfg) return <Spinner />;
  async function save() {
    setMsg(null);
    try { await api("/api/admin/config", { method: "PUT", body: { config: cfg } }); setMsg({ tone: "success", text: "Saved." }); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  const sev = (k: "ops.alertMinSeverity" | "ops.issueMinSeverity", label: string) => (
    <label className="block text-sm font-semibold">{label}<select className="input mt-1" disabled={!canEdit} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
  );
  return (
    <section className="panel space-y-4 p-5">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(cfg["ops.thresholds"]).map(([k, v]) => (
          <label key={k} className="block text-sm font-semibold">{LABELS[k] ?? k}<input className="input mt-1" type="number" disabled={!canEdit} value={v} onChange={(e) => setCfg({ ...cfg, "ops.thresholds": { ...cfg["ops.thresholds"], [k]: Number(e.target.value) } })} /></label>
        ))}
        {sev("ops.alertMinSeverity", "Alert staff from this severity")}
        {sev("ops.issueMinSeverity", "Send to the AI engineer from this severity")}
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" disabled={!canEdit} checked={cfg["ops.autoRollback"]} onChange={(e) => setCfg({ ...cfg, "ops.autoRollback": e.target.checked })} />Roll back a broken release automatically (needs RENDER_API_KEY)</label>
      {canEdit ? <button className="btn-primary" onClick={save}>Save settings</button> : <p className="text-sm text-ink-soft">Only admins can change these.</p>}
    </section>
  );
}

export default function Page() {
  return <AdminShell><Engineering /></AdminShell>;
}
