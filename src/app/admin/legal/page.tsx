"use client";
import Link from "next/link";
import { useState } from "react";
import { AdminShell, AdminTitle, StatusPill, useStaff } from "@/components/AdminShell";
import { Alert, Modal, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";

function Legal() {
  const staff = useStaff();
  const { data, error, reload } = useApi<{ documents: any[] }>("/api/admin/legal");
  const [editing, setEditing] = useState<{ docId: string; title: string; versionId?: string; body: string; changeSummary: string; material: boolean } | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (!data) return <Spinner />;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ tone: "success", text: ok }); reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  async function saveDraft() {
    if (!editing) return;
    await run(() => editing.versionId
      ? api(`/api/admin/legal/${editing.versionId}`, { body: { action: "update_draft", body: editing.body, changeSummary: editing.changeSummary, material: editing.material } })
      : api("/api/admin/legal", { body: { documentId: editing.docId, body: editing.body, changeSummary: editing.changeSummary, material: editing.material } }), "Draft saved.");
    setEditing(null);
  }

  return (
    <>
      <AdminTitle title="Legal & compliance" sub="Draft → review → publish. Published versions are never edited; members re-accept required documents when a new version is published." />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="space-y-4">
        {data.documents.map((d) => {
          const latestPublished = d.versions.find((v: any) => v.status === "PUBLISHED");
          return (
            <section key={d.id} className="panel p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold">{d.title}</h2>
                {d.requiredAtSignup && <span className="chip text-xs">Required at sign-up</span>}
                <Link href={`/legal/${d.slug}`} target="_blank" className="text-sm underline">View public page</Link>
                <button className="btn-outline ml-auto px-3 py-1.5 text-sm" onClick={() => setEditing({ docId: d.id, title: d.title, body: latestPublished?.body ?? "", changeSummary: "", material: true })}>New version</button>
              </div>
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-ink-faint"><tr><th className="py-1">Version</th><th>Status</th><th>Effective</th><th>Acceptances</th><th>Lawyer review</th><th></th></tr></thead>
                <tbody className="divide-y divide-mist">
                  {d.versions.map((v: any) => (
                    <tr key={v.id}>
                      <td className="py-2">v{v.version}</td>
                      <td><StatusPill value={v.status} /></td>
                      <td>{v.effectiveAt ? new Date(v.effectiveAt).toLocaleDateString() : "—"}</td>
                      <td>{v.acceptances}{v.material === false ? <span className="ml-1 text-xs text-ink-faint">(minor change)</span> : null}</td>
                      <td>{v.lawyerReviewedAt ? <span className="text-sage">✓ {v.lawyerReviewedBy}</span> : v.status !== "DRAFT" && v.status !== "SUPERSEDED" ? (
                        <button className="underline" onClick={() => { const r = prompt("Name of the lawyer or firm who reviewed this exact version:"); if (r) run(() => api(`/api/admin/legal/${v.id}`, { body: { action: "record_lawyer_review", reviewer: r } }), "Lawyer review recorded."); }}>Record review</button>
                      ) : <span className="text-ink-faint">—</span>}</td>
                      <td className="space-x-2 text-right">
                        {v.status === "DRAFT" && <>
                          <button className="underline" onClick={() => setEditing({ docId: d.id, title: d.title, versionId: v.id, body: v.body, changeSummary: v.changeSummary ?? "", material: v.material !== false })}>Edit</button>
                          <button className="underline" onClick={() => run(() => api(`/api/admin/legal/${v.id}`, { body: { action: "submit_review" } }), "Sent for review.")}>Send for review</button>
                        </>}
                        {v.status === "IN_REVIEW" && <>
                          <button className="underline" onClick={() => run(() => api(`/api/admin/legal/${v.id}`, { body: { action: "back_to_draft" } }), "Returned to draft.")}>Back to draft</button>
                          {staff.permissions.includes("legal.publish") && <button className="font-semibold underline" onClick={() => run(() => api(`/api/admin/legal/${v.id}`, { body: { action: "publish" } }), "Published. Members will be asked to accept it.")}>Publish</button>}
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-ink-faint">Publishing requires a super admin who did not write the draft. Pages show “Draft for review” until a lawyer review is recorded for the published version. Export a PDF from the public page with your browser's “Save as PDF”.</p>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`${editing?.versionId ? "Edit draft" : "New version"} — ${editing?.title}`}>
        <p className="mb-2 text-sm text-ink-soft">Markdown: # heading, ## subheading, **bold**, “- ” lists.</p>
        <textarea className="input min-h-[45vh] font-mono text-sm" aria-label="Document text" value={editing?.body ?? ""} onChange={(e) => setEditing(editing && { ...editing, body: e.target.value })} />
        <label className="label mt-3" htmlFor="cs">What changed (shown to members)</label>
        <input id="cs" className="input" maxLength={1000} value={editing?.changeSummary ?? ""} onChange={(e) => setEditing(editing && { ...editing, changeSummary: e.target.value })} placeholder="e.g. Added how long we keep call records." />
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={editing?.material ?? true} onChange={(e) => setEditing(editing && { ...editing, material: e.target.checked })} />
          <span>Material change — members must accept this version again before continuing. Untick only for typos or contact details.</span>
        </label>
        <button className="btn-primary mt-4 w-full" onClick={saveDraft}>Save draft</button>
      </Modal>
    </>
  );
}

export default function Page() {
  return <AdminShell><Legal /></AdminShell>;
}
