"use client";
import Link from "next/link";
import { AdminShell, AdminTitle, StatusPill } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { timeAgo, useApi } from "@/lib/client";

function Matches() {
  const { data, error } = useApi<{ matches: any[] }>("/api/admin/matches");
  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (!data) return <Spinner />;
  return (
    <>
      <AdminTitle title="Matches" sub="Most recent 100. Conversations are private unless a report is filed." />
      <div className="overflow-x-auto rounded-card border border-mist bg-paper-raised">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-mist text-ink-soft"><tr><th className="px-4 py-3">Members</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Messages</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Matched</th></tr></thead>
          <tbody className="divide-y divide-mist">
            {data.matches.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${m.a.id}`} className="font-semibold hover:underline">{m.a.name ?? "deleted"}</Link> &amp; <Link href={`/admin/users/${m.b.id}`} className="font-semibold hover:underline">{m.b.name ?? "deleted"}</Link>
                  <span className="text-ink-faint"> · {m.a.city}</span>
                </td>
                <td className="px-4 py-3">{m.score}%</td>
                <td className="px-4 py-3">{m.messages}</td>
                <td className="px-4 py-3"><StatusPill value={m.status} /></td>
                <td className="px-4 py-3 text-ink-soft">{timeAgo(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Page() {
  return <AdminShell><Matches /></AdminShell>;
}
