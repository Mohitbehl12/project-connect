"use client";
import { useState } from "react";
import { AdminShell, AdminTitle, StatusPill } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { api, timeAgo, useApi } from "@/lib/client";

type A = {
  id: string; caseNo: string; kind: string; details: string; status: string; decision: string | null; createdAt: string; contactEmail: string | null;
  user: { id: string; email: string; status: string; restrictedAt: string | null } | null;
  history: { action: string; reason: string; at: string }[];
  automated: { id: string; kind: string; decision: string; reason: string; createdAt: string }[];
};

function Appeals() {
  const [tab, setTab] = useState("OPEN");
  const q = useApi<{ appeals: A[]; kinds: Record<string, string> }>(`/api/admin/appeals?status=${tab}`);
  const [text, setText] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  async function decide(a: A, outcome: "UPHELD" | "OVERTURNED") {
    setMsg(null);
    try { await api(`/api/admin/appeals/${a.id}`, { body: { outcome, decision: text[a.id] ?? "" } }); setMsg({ tone: "success", text: `${a.caseNo}: ${outcome === "OVERTURNED" ? "overturned — the decision is reversed" : "upheld"}. The person has been told.` }); q.reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  return (
    <>
      <AdminTitle title="Appeals" sub="Every appeal is decided by a person who wasn't involved in the original decision. Overturning a suspension, ban or restriction reverses it straight away." />
      <div className="mb-4 flex gap-2">
        {["OPEN", "UPHELD", "OVERTURNED"].map((t) => <button key={t} className={t === tab ? "btn-primary px-4 py-1.5 text-sm" : "btn-outline px-4 py-1.5 text-sm"} onClick={() => setTab(t)}>{t.toLowerCase()}</button>)}
      </div>
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {q.error && <Alert tone="error">{q.error.message}</Alert>}
      {!q.data && !q.error && <Spinner />}
      {q.data && !q.data.appeals.length && <p className="text-ink-soft">No appeals here.</p>}
      <div className="grid gap-3">
        {q.data?.appeals.map((a) => (
          <div key={a.id} className="panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div><span className="font-mono text-sm">{a.caseNo}</span> · <strong>{q.data!.kinds[a.kind] ?? a.kind}</strong></div>
              <div className="text-sm text-ink-soft">filed {timeAgo(a.createdAt)} · <StatusPill value={a.status} /></div>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{a.user ? <>Account {a.user.email} · <StatusPill value={a.user.status} />{a.user.restrictedAt ? " · features paused" : ""}</> : <>No sign-in (banned?) · reply to {a.contactEmail}</>}</p>
            <p className="mt-3 whitespace-pre-wrap">{a.details}</p>
            {(a.history.length > 0 || a.automated.length > 0) && (
              <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Decision history</summary>
                <ul className="mt-2 space-y-1">
                  {a.history.map((h, i) => <li key={i}>Staff · {h.action.toLowerCase()} — {h.reason} ({timeAgo(h.at)})</li>)}
                  {a.automated.map((d) => <li key={d.id}>Automated · {d.kind.toLowerCase().replace("_", " ")}: {d.decision.toLowerCase().replace(/_/g, " ")} — {d.reason} ({timeAgo(d.createdAt)})</li>)}
                </ul>
              </details>
            )}
            {a.decision && <p className="mt-3 rounded-xl bg-paper-sunk p-3 text-sm"><strong>Decision:</strong> {a.decision}</p>}
            {a.status === "OPEN" && (
              <div className="mt-3 space-y-2">
                <textarea aria-label={`Decision for ${a.caseNo}`} className="input min-h-20" placeholder="Explain the decision to the person (required)" value={text[a.id] ?? ""} onChange={(e) => setText({ ...text, [a.id]: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => decide(a, "OVERTURNED")}>Overturn (reverse decision)</button>
                  <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => decide(a, "UPHELD")}>Uphold</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return <AdminShell><Appeals /></AdminShell>;
}
