"use client";
import Link from "next/link";
import { useEffect } from "react";
import { AppShell, PageHeader, useMe } from "@/components/AppShell";
import { Alert, Empty, Spinner } from "@/components/ui";
import { api, timeAgo, useApi } from "@/lib/client";

type N = { id: string; type: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

const DOT: Record<string, string> = { MATCH: "bg-marigold", MESSAGE: "bg-ink", LIKE: "bg-rose", VERIFICATION: "bg-sage", DATE: "bg-marigold-deep", MODERATION: "bg-rose", SECURITY: "bg-rose" };

function Notifications() {
  const { reload } = useMe();
  const { data, loading, error } = useApi<{ notifications: N[] }>("/api/notifications");
  useEffect(() => {
    if (data?.notifications.some((n) => !n.readAt)) api("/api/notifications", { method: "POST" }).then(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Alerts" />
      <div className="px-4 md:px-8">
        {loading && <Spinner />}
        {error && <Alert tone="error">{error.message}</Alert>}
        {data && !data.notifications.length && <Empty title="Nothing new" body="Matches, messages and updates about your account will appear here." />}
        <ul className="divide-y divide-mist">
          {data?.notifications.map((n) => {
            const inner = (
              <div className="flex gap-3 py-4">
                <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${n.readAt ? "bg-mist" : DOT[n.type] ?? "bg-ink"}`} aria-hidden />
                <div className="flex-1">
                  <p className={n.readAt ? "" : "font-semibold"}>{n.title}</p>
                  <p className="text-[15px] text-ink-soft">{n.body}</p>
                </div>
                <span className="text-xs text-ink-faint">{timeAgo(n.createdAt)}</span>
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-paper-sunk/50">{inner}</Link> : inner}</li>;
          })}
        </ul>
      </div>
    </div>
  );
}

export default function Page() {
  return <AppShell><Notifications /></AppShell>;
}
