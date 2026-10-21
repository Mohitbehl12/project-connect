"use client";
import Link from "next/link";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SponsoredSlot } from "@/components/ads/SponsoredSlot";
import { ProfileView, type Card } from "@/components/ProfileView";
import { Alert, Empty, Modal, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";

function Likes() {
  const { data, loading, error, reload } = useApi<{ total: number; cards: Card[]; hidden: number; canSeeAll: boolean }>("/api/likes");
  const [match, setMatch] = useState<{ id: string; name: string } | null>(null);
  const [err, setErr] = useState("");

  async function respond(c: Card, kind: "LIKE" | "PASS") {
    setErr("");
    try {
      const r = await api<{ matched: boolean; matchId: string | null }>("/api/likes", { body: { toId: c.id, kind } });
      if (r.matched && r.matchId) setMatch({ id: r.matchId, name: c.firstName });
      reload();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Likes" sub={data ? (data.total ? `${data.total} ${data.total === 1 ? "person likes" : "people like"} you` : undefined) : undefined} />
      <SponsoredSlot placement="BANNER" compact className="mb-4" />
      <div className="space-y-6 px-4 md:px-8">
        {loading && <Spinner />}
        {error && <Alert tone="error">{error.message}</Alert>}
        {err && <Alert tone="error">{err}</Alert>}
        {data && data.total === 0 && <Empty title="No new likes yet" body="Complete your profile and verify it to stand out. Likes you receive will show up here." action={{ href: "/profile", label: "Improve your profile" }} />}
        {data && data.hidden > 0 && (
          <div className="panel flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <div className="flex -space-x-3" aria-hidden>
              {Array.from({ length: Math.min(4, data.hidden) }).map((_, i) => (
                <div key={i} className="h-12 w-12 rounded-full border-2 border-paper-raised bg-gradient-to-br from-mist to-ink-faint blur-[2px]" />
              ))}
            </div>
            <div className="flex-1">
              <p className="font-bold">{data.hidden} more {data.hidden === 1 ? "person likes" : "people like"} you</p>
              <p className="text-sm text-ink-soft">Keep discovering — if you like them too, you'll match. Or see everyone now with Premium.</p>
            </div>
            <Link href="/plans" className="btn-accent">See who</Link>
          </div>
        )}
        {data?.cards.map((c) => (
          <div key={c.id}>
            <ProfileView card={c} compact />
            <div className="mt-3 flex gap-3">
              <button className="btn-outline flex-1" onClick={() => respond(c, "PASS")}>Not for me</button>
              <button className="btn-accent flex-1" onClick={() => respond(c, "LIKE")}>Like back</button>
            </div>
          </div>
        ))}
      </div>
      <Modal open={!!match} onClose={() => setMatch(null)} title="It's mutual">
        <p className="text-lg">You and {match?.name} matched.</p>
        <Link href={`/matches/${match?.id}`} className="btn-primary mt-6 w-full">Say hello</Link>
      </Modal>
    </div>
  );
}

export default function Page() {
  return <AppShell><Likes /></AppShell>;
}
