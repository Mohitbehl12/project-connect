"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CompatRing } from "@/components/CompatRing";
import { ProfileView, type Card } from "@/components/ProfileView";
import { ReportDialog } from "@/components/ReportDialog";
import { Alert, Avatar, Field, Modal, Segmented, Spinner, Verified } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { DATE_KINDS } from "@/lib/constants";

type Msg = { id: string; mine: boolean; kind: string; body: string | null; deleted: boolean; createdAt: string; read?: boolean; warning: string | null };
type DatePlan = { id: string; kind: string; place: string; startsAt: string; status: string; note: string | null; mine: boolean };
type Detail = { match: { id: string; score: number }; other: Card & { online: boolean }; starters: { tip: string; text: string }[]; dates: DatePlan[] };

function Chat() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, reload: reloadDetail } = useApi<Detail>(`/api/matches/${id}`);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [ended, setEnded] = useState(false);
  const [text, setText] = useState("");
  const [sendErr, setSendErr] = useState("");
  const [panel, setPanel] = useState<null | "profile" | "date" | "menu" | "report">(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  async function loadMessages() {
    try {
      const r = await api<{ messages: Msg[]; ended: boolean }>(`/api/matches/${id}/messages`);
      setMsgs(r.messages);
      setEnded(r.ended);
    } catch { /* surfaced via detail error */ }
  }

  useEffect(() => {
    loadMessages();
    const t = setInterval(() => { if (document.visibilityState === "visible") loadMessages(); }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (msgs && msgs.length !== lastCount.current) {
      lastCount.current = msgs.length;
      bottom.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [msgs]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSendErr("");
    try {
      await api(`/api/matches/${id}/messages`, { body: { body } });
      setText("");
      loadMessages();
    } catch (e: any) { setSendErr(e.message); }
  }

  async function del(mid: string) {
    if (!confirm("Delete this message for both of you?")) return;
    await api(`/api/messages/${mid}`, { method: "DELETE" });
    loadMessages();
  }

  async function unmatch() {
    if (!confirm(`Unmatch ${data?.other.firstName}? The conversation will disappear for both of you.`)) return;
    await api(`/api/matches/${id}/unmatch`, { method: "POST" });
    router.push("/matches");
  }
  async function block() {
    if (!confirm(`Block ${data?.other.firstName}? You won't see each other again.`)) return;
    await api("/api/blocks", { body: { userId: data!.other.id } });
    router.push("/matches");
  }

  if (error) return <div className="mx-auto max-w-2xl p-6"><Alert tone="error">{error.message}</Alert><Link href="/matches" className="btn-outline mt-4">Back to chats</Link></div>;
  if (!data) return <Spinner />;
  const o = data.other;
  const nextDate = data.dates.find((d) => d.status !== "CANCELLED" && new Date(d.startsAt) > new Date());

  return (
    <div className="fixed inset-x-0 bottom-16 top-0 z-30 mx-auto flex max-w-2xl flex-col bg-paper md:static md:h-dvh">
      <header className="flex items-center gap-3 border-b border-mist bg-paper-raised px-4 py-3">
        <Link href="/matches" className="btn-ghost -ml-2 px-2" aria-label="Back to chats">←</Link>
        <button onClick={() => setPanel("profile")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar id={o.id} name={o.firstName} size={42} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-bold">{o.firstName} {o.verified && <Verified className="hidden sm:inline-flex" />}</p>
            <p className="truncate text-xs text-ink-faint">{o.online ? "Active now" : o.city}</p>
          </div>
        </button>
        <button className="btn-outline shrink-0 px-3 py-2 text-sm" onClick={() => setPanel("date")} disabled={ended}><span className="sm:hidden">Date</span><span className="hidden sm:inline">Plan a date</span></button>
        <button className="btn-ghost px-3" aria-label="Safety and options" onClick={() => setPanel("menu")}>⋯</button>
      </header>

      {nextDate && (
        <DateBanner plan={nextDate} onChange={() => { reloadDetail(); loadMessages(); }} />
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs === null && <Spinner />}
        {msgs && msgs.filter((m) => m.kind === "TEXT").length === 0 && (
          <div className="mx-auto max-w-md py-6 text-center">
            <div className="flex justify-center"><CompatRing score={data.match.score} size={88} /></div>
            <p className="mt-3 font-display text-2xl font-extrabold">You matched with {o.firstName}</p>
            <ul className="mt-2 space-y-0.5 text-sm text-ink-soft">{(o.reasons ?? []).slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="mt-6 text-sm font-semibold text-ink-faint">Tap a starter to use it</p>
            <div className="mt-2 space-y-2">
              {data.starters.map((s) => (
                <button key={s.text} onClick={() => setText(s.text)}
                  className="block w-full rounded-xl border border-mist bg-paper-raised px-4 py-3 text-left hover:border-ink-faint">
                  <span className="block text-xs font-semibold text-ink-faint">{s.tip}</span>
                  <span className="text-[15px]">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <ul className="space-y-2">
          {msgs?.map((m) => m.kind === "SYSTEM" ? (
            <li key={m.id} className="py-2 text-center text-xs text-ink-faint">{m.body}</li>
          ) : (
            <li key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
              <div className={`group relative max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] ${m.mine ? "rounded-br-md bg-ink text-paper" : "rounded-bl-md bg-paper-raised border border-mist"} ${m.deleted ? "italic opacity-60" : ""}`}>
                {m.deleted ? "Message deleted" : m.body}
                {m.mine && !m.deleted && (
                  <button onClick={() => del(m.id)} className="absolute -left-14 top-1/2 hidden -translate-y-1/2 text-xs text-ink-faint hover:text-rose group-hover:block focus:block">Delete</button>
                )}
              </div>
              {m.warning && (
                <div className="mt-1 max-w-[80%] rounded-xl bg-marigold-wash px-3 py-2 text-xs text-ink">
                  ⚠ {m.warning} <button className="font-semibold underline" onClick={() => setPanel("report")}>Report</button>
                </div>
              )}
              <span className="mt-0.5 text-[11px] text-ink-faint">
                {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {m.mine && m.read !== undefined && (m.read ? " · Read" : " · Sent")}
              </span>
            </li>
          ))}
        </ul>
        <div ref={bottom} />
      </div>

      {ended ? (
        <p className="border-t border-mist p-4 text-center text-ink-soft">This conversation has ended.</p>
      ) : (
        <form onSubmit={send} className="border-t border-mist bg-paper-raised p-3">
          {sendErr && <div className="mb-2"><Alert tone="error">{sendErr}</Alert></div>}
          <div className="flex gap-2">
            <label htmlFor="msg" className="sr-only">Message</label>
            <textarea id="msg" rows={1} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Message ${o.firstName}`} className="input max-h-32 min-h-11 flex-1 resize-none" />
            <button className="btn-primary px-5" disabled={!text.trim()}>Send</button>
          </div>
        </form>
      )}

      <Modal open={panel === "profile"} onClose={() => setPanel(null)} title={o.firstName}>
        <ProfileView card={o} />
      </Modal>

      <Modal open={panel === "menu"} onClose={() => setPanel(null)} title="Safety and options">
        <div className="space-y-2">
          <button className="btn-outline w-full justify-start" onClick={() => setPanel("report")}>Report {o.firstName}</button>
          <button className="btn-outline w-full justify-start" onClick={block}>Block {o.firstName}</button>
          <button className="btn-outline w-full justify-start" onClick={unmatch}>Unmatch</button>
          <Link href="/safety-center" className="btn-ghost w-full justify-start text-sage">Open Safety Center</Link>
        </div>
      </Modal>

      <ReportDialog open={panel === "report"} onClose={() => setPanel(null)} userId={o.id} name={o.firstName}
        onDone={() => router.push("/matches")} />

      <DatePlanner open={panel === "date"} onClose={() => setPanel(null)} matchId={id} name={o.firstName}
        onDone={() => { setPanel(null); reloadDetail(); loadMessages(); }} />
    </div>
  );
}

function DateBanner({ plan, onChange }: { plan: DatePlan; onChange: () => void }) {
  const [err, setErr] = useState("");
  const when = new Date(plan.startsAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const act = async (action: "confirm" | "cancel") => {
    try { await api(`/api/dates/${plan.id}`, { method: "PATCH", body: { action } }); onChange(); }
    catch (e: any) { setErr(e.message); }
  };
  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${plan.status === "CONFIRMED" ? "bg-sage-wash" : "bg-marigold-wash"}`}>
      <div className="flex-1">
        <p className="font-semibold">{plan.status === "CONFIRMED" ? "Date confirmed" : plan.mine ? "Waiting for a reply" : "Date suggestion"}: {DATE_KINDS[plan.kind as keyof typeof DATE_KINDS]} at {plan.place}</p>
        <p className="text-ink-soft">{when}{plan.note ? ` · ${plan.note}` : ""}</p>
        {err && <p className="text-rose">{err}</p>}
      </div>
      {plan.status === "PROPOSED" && !plan.mine && <button className="btn-primary px-4 py-1.5 text-sm" onClick={() => act("confirm")}>Confirm</button>}
      <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => act("cancel")}>Cancel</button>
    </div>
  );
}

function DatePlanner({ open, onClose, matchId, name, onDone }: { open: boolean; onClose: () => void; matchId: string; name: string; onDone: () => void }) {
  const [kind, setKind] = useState("COFFEE");
  const [place, setPlace] = useState("");
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api(`/api/matches/${matchId}/dates`, { body: { kind, place, startsAt: new Date(when).toISOString(), note: note || undefined } });
      onDone();
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Plan a date with ${name}`}>
      <form onSubmit={submit} className="space-y-5">
        <Alert tone="info">For a first meeting, choose a busy public place and arrange your own way there and back.</Alert>
        <div><p className="label">What</p><Segmented options={DATE_KINDS} value={kind} onChange={setKind} /></div>
        <Field label="Where" hint="A venue name and area, e.g. “Blue Tokai, Champa Gali”.">{(id) => <input id={id} className="input" required maxLength={120} value={place} onChange={(e) => setPlace(e.target.value)} />}</Field>
        <Field label="When">{(id) => <input id={id} type="datetime-local" className="input" required value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>
        <Field label="Note (optional)">{(id) => <input id={id} className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {err && <Alert tone="error">{err}</Alert>}
        <button className="btn-primary w-full">Send suggestion</button>
      </form>
    </Modal>
  );
}

export default function Page() {
  return <AppShell><Chat /></AppShell>;
}
