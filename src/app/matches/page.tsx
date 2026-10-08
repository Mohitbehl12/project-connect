"use client";
import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Alert, Avatar, Empty, Spinner, Verified } from "@/components/ui";
import { timeAgo, useApi } from "@/lib/client";

type Row = {
  id: string; score: number; createdAt: string; unread: number;
  other: { firstName: string; age: number; city: string; verified: boolean };
  lastMessage: { body: string; mine: boolean; at: string } | null;
};

function Matches() {
  const { data, loading, error } = useApi<{ matches: Row[] }>("/api/matches");
  const fresh = data?.matches.filter((m) => !m.lastMessage) ?? [];
  const talking = data?.matches.filter((m) => m.lastMessage) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Chats" />
      <div className="px-4 md:px-8">
        {loading && <Spinner />}
        {error && <Alert tone="error">{error.message}</Alert>}
        {data && !data.matches.length && <Empty title="No matches yet" body="When you and someone both like each other, you can chat here." action={{ href: "/discover", label: "Start discovering" }} />}

        {fresh.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-bold">New matches</h2>
            <ul className="flex gap-4 overflow-x-auto pb-2">
              {fresh.map((m) => (
                <li key={m.id}>
                  <Link href={`/matches/${m.id}`} className="flex w-20 flex-col items-center gap-1.5 text-center">
                    <Avatar id={m.id} name={m.other.firstName} size={64} />
                    <span className="text-sm font-semibold">{m.other.firstName}</span>
                    <span className="text-xs text-ink-faint">{m.score}% match</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {talking.length > 0 && (
          <section>
            <h2 className="mb-1 text-lg font-bold">Conversations</h2>
            <ul className="divide-y divide-mist">
              {talking.map((m) => (
                <li key={m.id}>
                  <Link href={`/matches/${m.id}`} className="flex items-center gap-4 py-4 hover:bg-paper-sunk/50">
                    <Avatar id={m.id} name={m.other.firstName} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{m.other.firstName}, {m.other.age}</span>
                        {m.other.verified && <Verified />}
                        <span className="ml-auto text-xs text-ink-faint">{timeAgo(m.lastMessage!.at)}</span>
                      </div>
                      <p className={`truncate text-[15px] ${m.unread ? "font-semibold text-ink" : "text-ink-soft"}`}>
                        {m.lastMessage!.mine && "You: "}{m.lastMessage!.body}
                      </p>
                    </div>
                    {m.unread > 0 && <span className="rounded-pill bg-marigold px-2 py-0.5 text-xs font-bold">{m.unread}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <AppShell><Matches /></AppShell>;
}
