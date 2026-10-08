"use client";
import Link from "next/link";
import { useState } from "react";
import { AppShell, PageHeader, useMe } from "@/components/AppShell";
import { ProfileView, type Card } from "@/components/ProfileView";
import { ReportDialog } from "@/components/ReportDialog";
import { Alert, Empty, Modal, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";

const MODES = [
  ["recommended", "Best fit"],
  ["compatibility", "Personality"],
  ["interests", "Shared interests"],
  ["intent", "Same goals"],
  ["nearby", "Nearby"],
] as const;

function Discover() {
  const { me } = useMe();
  const [mode, setMode] = useState<string>("recommended");
  const { data, loading, error, reload } = useApi<{ cards: Card[]; totalAvailable: number }>(`/api/discovery?mode=${mode}`);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [match, setMatch] = useState<{ id: string; name: string } | null>(null);
  const [reporting, setReporting] = useState(false);

  const card = data?.cards[index];

  async function act(kind: "LIKE" | "PASS" | "PRIORITY", withNote?: string) {
    if (!card) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ matched: boolean; matchId: string | null }>("/api/likes", { body: { toId: card.id, kind, note: withNote || undefined } });
      if (r.matched && r.matchId) setMatch({ id: r.matchId, name: card.firstName });
      advance();
    } catch (e: any) {
      setNotice({ tone: "error", text: e.message });
    } finally {
      setBusy(false);
      setNoteOpen(false);
      setNote("");
    }
  }

  function advance() {
    if (data && index + 1 >= data.cards.length) { setIndex(0); reload(); }
    else setIndex((i) => i + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Discover" sub={data ? `${data.totalAvailable} people fit what you're looking for` : undefined}
        action={<Link href="/profile#preferences" className="btn-outline px-4 py-2 text-sm">Preferences</Link>} />
      <div className="no-scrollbar -mt-1 flex gap-2 overflow-x-auto px-4 pb-4 md:px-8" role="tablist" aria-label="Discovery mode">
        {MODES.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setIndex(0); }}
            className={`shrink-0 rounded-pill px-4 py-2 text-sm font-semibold ${mode === k ? "bg-ink text-paper" : "bg-paper-raised text-ink-soft border border-mist"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 md:px-8">
        {me.user.selfieStatus === "NONE" && (
          <div className="mb-4"><Alert tone="info">Verified profiles get more likes. <Link href="/settings#verification" className="font-semibold underline">Verify with a selfie</Link></Alert></div>
        )}
        {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}{notice.text.includes("upgrade") && <> <Link href="/plans" className="font-semibold underline">See plans</Link></>}</Alert></div>}
        {loading && <Spinner />}
        {error && <Alert tone="error">{error.message}</Alert>}
        {!loading && data && !card && (
          <Empty title="You've seen everyone for now" body="Try another mode, widen your distance or age range, or check back tomorrow — new people join every day."
            action={{ href: "/profile#preferences", label: "Adjust preferences" }} />
        )}
        {card && (
          <>
            <ProfileView key={card.id} card={card} />
            <div className="sticky bottom-16 z-30 -mx-4 mt-4 flex gap-2 border-t border-mist bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-card md:border md:px-3">
              <button className="btn-outline h-12 flex-1" disabled={busy} onClick={() => act("PASS")}>Not for me</button>
              <button className="btn-outline h-12 px-4" disabled={busy} onClick={() => setNoteOpen(true)} aria-label="Priority like with a note" title="Priority like with a note">★ Note</button>
              <button className="btn-accent h-12 flex-1 text-base" disabled={busy} onClick={() => act("LIKE")}>Like</button>
            </div>
            <div className="mt-6 text-center">
              <button className="text-sm text-ink-faint underline hover:text-rose" onClick={() => setReporting(true)}>Report {card.firstName}</button>
            </div>
            <ReportDialog open={reporting} onClose={() => setReporting(false)} userId={card.id} name={card.firstName}
              onDone={() => { setReporting(false); setNotice({ tone: "info", text: `Thanks. ${card.firstName} has been reported and blocked.` }); advance(); }} />
          </>
        )}
      </div>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title={`Send ${card?.firstName ?? ""} a priority like`}>
        <p className="mb-3 text-ink-soft">Your note appears at the top of their likes. Mention something from their profile.</p>
        <textarea className="input min-h-24" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Your note" placeholder="Your trek photos convinced me — where was the last one?" />
        <p className="mt-1 text-sm text-ink-faint">{me.features.dailyPriorityLikes} priority like{me.features.dailyPriorityLikes === 1 ? "" : "s"} per day on your plan.</p>
        <button className="btn-accent mt-4 w-full" disabled={busy} onClick={() => act("PRIORITY", note.trim())}>Send priority like</button>
      </Modal>

      <Modal open={!!match} onClose={() => setMatch(null)} title="It's mutual">
        <p className="text-lg">You and {match?.name} both said yes.</p>
        <p className="mt-1 text-ink-soft">We've suggested a few ways to start the conversation.</p>
        <div className="mt-6 flex gap-3">
          <Link href={`/matches/${match?.id}`} className="btn-primary flex-1">Say hello</Link>
          <button className="btn-outline flex-1" onClick={() => setMatch(null)}>Keep discovering</button>
        </div>
      </Modal>
    </div>
  );
}

export default function Page() {
  return <AppShell><Discover /></AppShell>;
}
