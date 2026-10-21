"use client";
import { useState } from "react";
import { AdminShell, AdminTitle, useStaff } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { api, timeAgo, useApi } from "@/lib/client";

type Rules = { launchEnabled: boolean; minAge: number; ageAssurance: string; privacyLaw: string; grievanceReplyDays: number; urgentTakedownHours: number; coolingOffDays: number; pricesIncludeTax: boolean; dataTransferNote: string; legalReviewed: boolean; reviewer: string; reviewedAt: string | null };
type Data = {
  countries: Record<string, Rules>;
  vendors: { id: string; name: string; purpose: string; data: string; where: string; active: boolean; dpa: string; notes: string }[];
  retention: { what: string; keep: string }[];
  holds: { id: string; userId: string; email: string; kind: string; reason: string; reference: string | null; until: string | null; createdAt: string }[];
  auditChain: { ok: boolean; checked: number; brokenAt?: number; reason?: string };
  automatedDecisions: { kind: string; n: number }[];
  consentRecords: { kind: string; granted: boolean; n: number }[];
};

function Compliance() {
  const staff = useStaff();
  const q = useApi<Data>("/api/admin/compliance");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [hold, setHold] = useState({ userId: "", kind: "SAFETY", reason: "", reference: "" });
  if (q.error) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  const canEdit = staff.permissions.includes("config.edit");
  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ tone: "success", text: ok }); q.reload(); } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  const setCountry = (k: string, patch: Partial<Rules>) => run(() => api("/api/admin/compliance", { method: "PUT", body: { countries: { [k]: patch } } }), `${k} updated.`);
  return (
    <>
      <AdminTitle title="Privacy & compliance" sub="Country rules, service providers, data retention, legal holds and the audit trail. Starting values are for testing — a lawyer must confirm each launch country." />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

      <section className="panel p-5">
        <h2 className="text-lg font-bold">Audit trail</h2>
        <p className={`mt-2 text-sm ${q.data.auditChain.ok ? "text-sage" : "text-rose"}`}>
          {q.data.auditChain.ok ? `✓ Hash chain intact — ${q.data.auditChain.checked} entries verified.` : `✗ Chain broken at entry ${q.data.auditChain.brokenAt} (${q.data.auditChain.reason}). Someone changed or removed audit records — investigate.`}
        </p>
      </section>

      <section className="panel mt-4 overflow-x-auto p-5">
        <h2 className="text-lg font-bold">Country rules</h2>
        <table className="mt-3 w-full min-w-[900px] text-sm">
          <thead className="text-left text-ink-faint"><tr><th className="py-1">Country</th><th>Open</th><th>Min age</th><th>Age check</th><th>Privacy law</th><th>Complaint reply</th><th>Cooling-off</th><th>Lawyer reviewed</th></tr></thead>
          <tbody className="divide-y divide-mist">
            {Object.entries(q.data.countries).map(([k, r]) => (
              <tr key={k}>
                <td className="py-2 font-semibold">{k === "*" ? "Default" : k}</td>
                <td><input type="checkbox" aria-label={`${k} open for sign-up`} disabled={!canEdit} checked={r.launchEnabled} onChange={(e) => setCountry(k, { launchEnabled: e.target.checked })} /></td>
                <td>{canEdit ? <input className="input w-16 py-1" type="number" min={18} max={25} defaultValue={r.minAge} onBlur={(e) => Number(e.target.value) !== r.minAge && setCountry(k, { minAge: Number(e.target.value) })} /> : r.minAge}</td>
                <td>{canEdit ? (
                  <select className="input py-1" value={r.ageAssurance} onChange={(e) => setCountry(k, { ageAssurance: e.target.value })}>
                    <option value="SELF_DECLARED">Date of birth</option><option value="SELFIE_REQUIRED">Selfie before liking</option>
                  </select>) : r.ageAssurance}</td>
                <td className="max-w-xs">{r.privacyLaw}</td>
                <td>{r.grievanceReplyDays} days</td>
                <td>{r.coolingOffDays ? `${r.coolingOffDays} days` : "—"}</td>
                <td>{r.legalReviewed ? <span className="text-sage">✓ {r.reviewer}</span> : canEdit ? (
                  <button className="underline" onClick={() => { const who = prompt(`Lawyer or firm who confirmed the rules for ${k}:`); if (who) setCountry(k, { legalReviewed: true, reviewer: who }); }}>Record review</button>
                ) : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="text-lg font-bold">Service providers</h2>
        <p className="text-sm text-ink-soft">Generated from the live settings; also published at /legal/service-providers.</p>
        <ul className="mt-3 divide-y divide-mist">
          {q.data.vendors.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className={v.active ? "text-sage" : "text-ink-faint"}>{v.active ? "● in use" : "○ off"}</span>
              <span className="flex-1"><strong>{v.name}</strong> — {v.purpose}<br /><span className="text-ink-soft">{v.data} · {v.where}</span></span>
              {canEdit ? (
                <select className="input w-44 py-1" aria-label={`${v.name} DPA status`} value={v.dpa} onChange={(e) => run(() => api("/api/admin/compliance", { method: "PUT", body: { vendors: { [v.id]: { dpa: e.target.value, notes: v.notes } } } }), `${v.name}: DPA status saved.`)}>
                  <option value="NOT_STARTED">DPA not started</option><option value="IN_PROGRESS">DPA in progress</option><option value="SIGNED">DPA signed</option><option value="NOT_NEEDED">Not needed</option>
                </select>
              ) : <span>{v.dpa}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="text-lg font-bold">Data retention</h2>
        <p className="text-sm text-ink-soft">Runs daily with the scheduled jobs. Periods are set in Settings and shown to members in the Privacy Policy and before deleting an account.</p>
        <ul className="mt-3 space-y-1 text-sm">{q.data.retention.map((r) => <li key={r.what}><strong>{r.what}:</strong> {r.keep}</li>)}</ul>
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="text-lg font-bold">Legal holds</h2>
        <p className="text-sm text-ink-soft">A hold stops retention deleting an account's records — for a serious safety case, a lawful request from an authority, or litigation.</p>
        {q.data.holds.length ? (
          <ul className="mt-3 divide-y divide-mist text-sm">
            {q.data.holds.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="flex-1"><strong>{h.email}</strong> · {h.kind.toLowerCase().replace("_", " ")} · {h.reason}{h.reference ? ` · ref ${h.reference}` : ""} · since {timeAgo(h.createdAt)}{h.until ? ` · until ${new Date(h.until).toLocaleDateString()}` : ""}</span>
                <button className="underline" onClick={() => run(() => api(`/api/admin/legal-holds/${h.id}`, { method: "DELETE" }), "Hold released.")}>Release</button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-ink-faint">No active holds.</p>}
        <form className="mt-4 grid gap-2 md:grid-cols-[1fr_10rem_2fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); run(() => api("/api/admin/legal-holds", { body: { ...hold, reference: hold.reference || undefined } }), "Hold placed."); }}>
          <input className="input" placeholder="User id" aria-label="User id" value={hold.userId} onChange={(e) => setHold({ ...hold, userId: e.target.value })} required />
          <select className="input" aria-label="Kind" value={hold.kind} onChange={(e) => setHold({ ...hold, kind: e.target.value })}>
            <option value="SAFETY">Safety case</option><option value="LAWFUL_REQUEST">Lawful request</option><option value="LITIGATION">Litigation</option>
          </select>
          <input className="input" placeholder="Reason" aria-label="Reason" value={hold.reason} onChange={(e) => setHold({ ...hold, reason: e.target.value })} required minLength={10} />
          <input className="input" placeholder="Reference (optional)" aria-label="Reference" value={hold.reference} onChange={(e) => setHold({ ...hold, reference: e.target.value })} />
          <button className="btn-primary px-4">Place hold</button>
        </form>
      </section>

      <section className="panel mt-4 grid gap-6 p-5 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-bold">Automated decisions logged</h2>
          <ul className="mt-2 text-sm">{q.data.automatedDecisions.length ? q.data.automatedDecisions.map((d) => <li key={d.kind}>{d.kind.toLowerCase().replace("_", " ")}: {d.n}</li>) : <li className="text-ink-faint">None yet</li>}</ul>
          <p className="mt-2 text-xs text-ink-faint">Members see their own in Privacy Center and can appeal. Serious enforcement is always decided by a person.</p>
        </div>
        <div>
          <h2 className="text-lg font-bold">Consent records</h2>
          <ul className="mt-2 text-sm">{q.data.consentRecords.length ? q.data.consentRecords.map((c) => <li key={c.kind + c.granted}>{c.kind.toLowerCase().replace("_", " ")} — {c.granted ? "given" : "withdrawn"}: {c.n}</li>) : <li className="text-ink-faint">None yet</li>}</ul>
        </div>
      </section>
    </>
  );
}

export default function Page() {
  return <AdminShell><Compliance /></AdminShell>;
}
