"use client";
import Link from "next/link";
import { useState } from "react";
import { AdminShell, AdminTitle, StatusPill, useStaff } from "@/components/AdminShell";
import { Alert, Modal, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";

function Legal() {
  const staff = useStaff();
  const { data, error, reload } = useApi<{ documents: any[] }>("/api/admin/legal");
  const [editing, setEditing] = useState<{ docId: string; title: string; versionId?: string; body: string } | null>(null);
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
      ? api(`/api/admin/legal/${editing.versionId}`, { body: { action: "update_draft", body: editing.body } })
      : api("/api/admin/legal", { body: { documentId: editing.docId, body: editing.body } }), "Draft saved.");
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
                <button className="btn-outline ml-auto px-3 py-1.5 text-sm" onClick={() => setEditing({ docId: d.id, title: d.title, body: latestPublished?.body ?? "" })}>New version</button>
              </div>
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-ink-faint"><tr><th className="py-1">Version</th><th>Status</th><th>Effective</th><th>Acceptances</th><th></th></tr></thead>
                <tbody className="divide-y divide-mist">
                  {d.versions.map((v: any) => (
                    <tr key={v.id}>
                      <td className="py-2">v{v.version}</td>
                      <td><StatusPill value={v.status} /></td>
                      <td>{v.effectiveAt ? new Date(v.effectiveAt).toLocaleDateString() : "—"}</td>
                      <td>{v.acceptances}</td>
                      <td className="space-x-2 text-right">
                        {v.status === "DRAFT" && <>
                          <button className="underline" onClick={() => setEditing({ docId: d.id, title: d.title, versionId: v.id, body: v.body })}>Edit</button>
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
      <p className="mt-4 text-sm text-ink-faint">Publishing requires a super admin who did not write the draft. Export a PDF from the public page with your browser's “Save as PDF”.</p>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`${editing?.versionId ? "Edit draft" : "New version"} — ${editing?.title}`}>
        <p className="mb-2 text-sm text-ink-soft">Markdown: # heading, ## subheading, **bold**, “- ” lists.</p>
        <textarea className="input min-h-[50vh] font-mono text-sm" aria-label="Document text" value={editing?.body ?? ""} onChange={(e) => setEditing(editing && { ...editing, body: e.target.value })} />
        <button className="btn-primary mt-4 w-full" onClick={saveDraft}>Save draft</button>
      </Modal>
    </>
  );
}

export default function Page() {
  return <AdminShell><Legal /></AdminShell>;
}
