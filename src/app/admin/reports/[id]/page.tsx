"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AdminShell, AdminTitle, StatusPill } from "@/components/AdminShell";
import { ModerationActions } from "@/components/ModerationActions";
import { Alert, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { REPORT_CATEGORIES } from "@/lib/constants";

function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApi<any>(`/api/admin/reports/${id}`);
  const [resolution, setResolution] = useState("");
  const [err, setErr] = useState("");
  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (!data) return <Spinner />;
  const r = data.report;

  async function close(status: "ACTIONED" | "DISMISSED") {
    setErr("");
    try { await api(`/api/admin/reports/${id}`, { body: { status, resolution } }); reload(); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <>
      <Link href="/admin/reports" className="text-sm text-ink-soft hover:underline">← Reports</Link>
      <AdminTitle title={REPORT_CATEGORIES[r.category as keyof typeof REPORT_CATEGORIES]} sub={`${r.automated ? "Raised by automated screening" : "Raised by a member"} · ${new Date(r.createdAt).toLocaleString()}`} />
      <div className="mb-6 flex flex-wrap gap-2"><StatusPill value={r.priority} /><StatusPill value={r.status} /></div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          <section className="panel p-5">
            <h2 className="mb-2 text-lg font-bold">Reported member</h2>
            {data.reported ? (
              <>
                <p><Link href={`/admin/users/${data.reported.id}`} className="font-semibold underline">{data.reported.name ?? data.reported.email}</Link> <StatusPill value={data.reported.status} /></p>
                <p className="text-sm text-ink-soft">{data.reported.email} · {data.priorReports} other report{data.priorReports === 1 ? "" : "s"}</p>
                {data.reported.bio && <p className="mt-2 text-sm">“{data.reported.bio}”</p>}
                <div className="mt-4"><ModerationActions userId={data.reported.id} status={data.reported.status} selfieStatus={data.reported.selfieStatus} reportId={r.id} onDone={reload} /></div>
              </>
            ) : <p className="text-ink-soft">Account deleted.</p>}
          </section>
          <section className="panel p-5">
            <h2 className="mb-2 text-lg font-bold">Details</h2>
            <p>{r.details || <span className="text-ink-faint">No details provided.</span>}</p>
            {r.status === "OPEN" ? (
              <div className="mt-4 space-y-3">
                <label className="label" htmlFor="res">Resolution note</label>
                <textarea id="res" className="input min-h-20" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="What you found and what you did" />
                {err && <Alert tone="error">{err}</Alert>}
                <div className="flex gap-2">
                  <button className="btn-primary" disabled={resolution.trim().length < 3} onClick={() => close("ACTIONED")}>Close as actioned</button>
                  <button className="btn-outline" disabled={resolution.trim().length < 3} onClick={() => close("DISMISSED")}>Dismiss</button>
                </div>
              </div>
            ) : <p className="mt-4 rounded-xl bg-paper-sunk p-3 text-sm"><strong>Resolution:</strong> {r.resolution}</p>}
          </section>
        </div>

        <section className="panel p-5">
          <h2 className="mb-1 text-lg font-bold">Conversation evidence</h2>
          <p className="mb-4 text-sm text-ink-faint">Viewing is recorded in the audit log. Deleted messages are shown for investigation only.</p>
          {!data.evidence.length ? <p className="text-ink-soft">No conversation attached to this report.</p> : (
            <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
              {data.evidence.map((m: any) => (
                <li key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.highlighted ? "ring-2 ring-rose" : ""} ${m.fromReported ? "bg-rose-wash" : "bg-paper-sunk"}`}>
                  <p className="text-xs font-semibold text-ink-faint">{m.fromReported ? "Reported member" : "Other member"} · {new Date(m.createdAt).toLocaleString()}{m.deleted ? " · deleted" : ""}{m.flags ? ` · flags: ${m.flags}` : ""}</p>
                  <p>{m.body}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {m.media?.kind === "PHOTO" && <img src={m.media.url} alt="Photo sent in the chat" className="mt-2 max-h-64 rounded-lg" />}
                  {m.media?.kind === "VOICE" && <audio controls preload="none" src={m.media.url} className="mt-2 w-full" />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

export default function Page() {
  return <AdminShell><ReportDetail /></AdminShell>;
}
