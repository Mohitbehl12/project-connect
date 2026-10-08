"use client";
import { useState } from "react";
import { AdminShell, AdminTitle } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { useApi } from "@/lib/client";

function Audit() {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const { data, error } = useApi<{ logs: any[] }>(`/api/admin/audit?action=${filter}&page=${page}`);
  return (
    <>
      <AdminTitle title="Audit log" sub="Every sign-in, moderation action, config change and evidence view." action={
        <select className="input w-auto" aria-label="Filter" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
          <option value="">All events</option><option value="moderation">Moderation</option><option value="report">Reports</option><option value="admin">Admin views</option>
          <option value="config">Config</option><option value="plans">Plans</option><option value="legal">Legal</option><option value="auth">Sign-ins</option><option value="safety">Automated safety</option><option value="subscription">Subscriptions</option>
        </select>
      } />
      {error && <Alert tone="error">{error.message}</Alert>}
      {!data ? <Spinner /> : (
        <div className="overflow-x-auto rounded-card border border-mist bg-paper-raised">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-mist text-ink-soft"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Details</th></tr></thead>
            <tbody className="divide-y divide-mist">
              {data.logs.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5">{l.actor ? `${l.actor.email}` : <span className="text-ink-faint">system</span>}</td>
                  <td className="px-4 py-2.5"><code className="text-xs">{l.action}</code></td>
                  <td className="px-4 py-2.5 text-ink-soft">{l.entity}{l.entityId ? ` ${l.entityId.slice(0, 8)}` : ""}</td>
                  <td className="max-w-md truncate px-4 py-2.5 text-xs text-ink-faint" title={JSON.stringify(l.meta)}>{Object.keys(l.meta).length ? JSON.stringify(l.meta) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex gap-3">
        <button className="btn-outline px-3 py-1.5 text-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
        <button className="btn-outline px-3 py-1.5 text-sm" disabled={(data?.logs.length ?? 0) < 50} onClick={() => setPage(page + 1)}>Older</button>
      </div>
    </>
  );
}

export default function Page() {
  return <AdminShell><Audit /></AdminShell>;
}
