"use client";
import Link from "next/link";
import { useState } from "react";
import { AdminShell, AdminTitle, StatusPill } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { timeAgo, useApi } from "@/lib/client";

type U = { id: string; email: string; role: string; status: string; selfieStatus: string; planCode: string; createdAt: string; lastActiveAt: string; name: string | null; age: number | null; city: string | null; completeness: number };

function Users() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const { data, loading, error } = useApi<{ users: U[]; total: number; pageSize: number }>(`/api/admin/users?q=${encodeURIComponent(query)}&status=${status}&page=${page}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <AdminTitle title="Users" sub={data ? `${data.total} accounts` : undefined} />
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q); }}>
        <input className="input max-w-sm" placeholder="Search name, email, city or ID" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="BANNED">Banned</option>
        </select>
        <button className="btn-primary">Search</button>
      </form>
      {error && <Alert tone="error">{error.message}</Alert>}
      {loading && <Spinner />}
      {data && (
        <div className="overflow-x-auto rounded-card border border-mist bg-paper-raised">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-mist text-ink-soft">
              <tr><th className="px-4 py-3 font-semibold">Member</th><th className="px-4 py-3 font-semibold">Location</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Verification</th><th className="px-4 py-3 font-semibold">Plan</th><th className="px-4 py-3 font-semibold">Last active</th></tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {data.users.map((u) => (
                <tr key={u.id} className="hover:bg-paper">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className="font-semibold hover:underline">{u.name ?? "(no profile)"}{u.age ? `, ${u.age}` : ""}</Link>
                    <p className="text-ink-faint">{u.email}{u.role !== "USER" ? ` · ${u.role}` : ""}</p>
                  </td>
                  <td className="px-4 py-3">{u.city ?? "—"}</td>
                  <td className="px-4 py-3"><StatusPill value={u.status} /></td>
                  <td className="px-4 py-3"><StatusPill value={u.selfieStatus} /></td>
                  <td className="px-4 py-3">{u.planCode}</td>
                  <td className="px-4 py-3 text-ink-soft">{timeAgo(u.lastActiveAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button className="btn-outline px-3 py-1.5 text-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="text-sm text-ink-soft">Page {page} of {pages}</span>
        <button className="btn-outline px-3 py-1.5 text-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </>
  );
}

export default function Page() {
  return <AdminShell><Users /></AdminShell>;
}
