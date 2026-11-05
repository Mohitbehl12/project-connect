"use client";
import Link from "next/link";
import { useState } from "react";
import { AdminShell, AdminTitle, StatusPill } from "@/components/AdminShell";
import { Alert, Empty, Spinner } from "@/components/ui";
import { timeAgo, useApi } from "@/lib/client";
import { REPORT_CATEGORIES } from "@/lib/constants";

const dueText = (h: number) => (h < 48 ? `${Math.max(h, 0)} h` : `${Math.round(h / 24)} days`);

function Reports() {
  const [status, setStatus] = useState("OPEN");
  const { data, loading, error } = useApi<{ reports: any[] }>(`/api/admin/reports?status=${status}`);
  return (
    <>
      <AdminTitle title="Reports" sub="Highest priority first. Review targets: critical 12 h, high 24 h, medium 3 days, low 7 days." action={
        <select className="input w-auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="OPEN">Open</option><option value="ACTIONED">Actioned</option><option value="DISMISSED">Dismissed</option><option value="ALL">All</option>
        </select>
      } />
      {error && <Alert tone="error">{error.message}</Alert>}
      {loading && <Spinner />}
      {data && !data.reports.length && <Empty title="Queue is clear" body="No reports with this status." />}
      <ul className="space-y-2">
        {data?.reports.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/reports/${r.id}`} className={`panel flex flex-wrap items-center gap-3 p-4 hover:border-ink-faint ${r.overdue ? "border-2 border-rose" : ""}`}>
              <StatusPill value={r.priority} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{REPORT_CATEGORIES[r.category as keyof typeof REPORT_CATEGORIES]} — {r.reported?.name ?? r.reported?.email ?? "deleted account"}</p>
                <p className="truncate text-sm text-ink-soft">{r.automated ? "Automated screening" : `Reported by ${r.reporter?.name ?? "a member"}`} · {r.details || "No details"}</p>
              </div>
              {r.reported && r.reported.status !== "ACTIVE" && <StatusPill value={r.reported.status} />}
              {r.status === "OPEN" && <span className={`text-sm font-semibold ${r.overdue ? "text-rose" : "text-ink-soft"}`}>{r.overdue ? `Overdue by ${dueText(-r.hoursLeft)}` : `Due in ${dueText(r.hoursLeft)}`}</span>}
              <span className="text-sm text-ink-faint">{timeAgo(r.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Page() {
  return <AdminShell><Reports /></AdminShell>;
}
