"use client";
import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SafetyContent } from "@/components/SafetyContent";
import { timeAgo, useApi } from "@/lib/client";
import { REPORT_CATEGORIES } from "@/lib/constants";

function SafetyCenter() {
  const { data } = useApi<{ reports: { id: string; category: string; status: string; createdAt: string }[] }>("/api/reports");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Safety Center" sub="Tools and advice for meeting people safely." />
      <div className="space-y-10 px-4 md:px-8">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="panel p-5"><p className="font-bold">Report or block</p><p className="mt-1 text-sm text-ink-soft">Use the ⋯ menu in any chat, or “Report” under a profile in Discover.</p></div>
          <Link href="/settings" className="panel p-5 hover:border-ink-faint"><p className="font-bold">Privacy controls</p><p className="mt-1 text-sm text-ink-soft">Pause discovery, hide activity status and read receipts.</p></Link>
          <Link href="/settings#verification" className="panel p-5 hover:border-ink-faint"><p className="font-bold">Get verified</p><p className="mt-1 text-sm text-ink-soft">A verified badge shows people you're real.</p></Link>
        </section>
        <section>
          <h2 className="text-2xl font-bold">Your reports</h2>
          {!data?.reports.length ? <p className="mt-2 text-ink-soft">You haven't reported anyone.</p> : (
            <ul className="mt-3 divide-y divide-mist rounded-card border border-mist bg-paper-raised">
              {data.reports.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-5 py-3">
                  <span>{REPORT_CATEGORIES[r.category as keyof typeof REPORT_CATEGORIES]} <span className="text-sm text-ink-faint">· {timeAgo(r.createdAt)}</span></span>
                  <span className={`text-sm font-semibold ${r.status === "Reviewed" ? "text-sage" : "text-marigold-deep"}`}>{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <SafetyContent />
      </div>
    </div>
  );
}

export default function Page() {
  return <AppShell><SafetyCenter /></AppShell>;
}
