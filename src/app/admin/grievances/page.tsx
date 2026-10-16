"use client";
import { useState } from "react";
import { AdminShell, AdminTitle } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { api, timeAgo, useApi } from "@/lib/client";

type G = { id: string; refNo: string; name: string; email: string; categoryLabel: string; category: string; details: string; status: string; createdAt: string; resolveDueAt: string; resolvedAt: string | null; resolution: string | null; hasAccount: boolean; overdue: boolean; hoursLeft: number };

function due(g: G) {
  if (g.resolvedAt) return `Closed ${timeAgo(g.resolvedAt)}`;
  if (g.overdue) return `Overdue by ${Math.abs(g.hoursLeft) < 48 ? `${Math.abs(g.hoursLeft)} h` : `${Math.round(Math.abs(g.hoursLeft) / 24)} days`}`;
  return g.hoursLeft < 48 ? `Due in ${g.hoursLeft} h` : `Due in ${Math.round(g.hoursLeft / 24)} days`;
}

function Grievances() {
  const [tab, setTab] = useState<"open" | "closed">("open");
  const q = useApi<{ grievances: G[] }>(`/api/admin/grievances?status=${tab}`);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  async function act(g: G, action: "progress" | "resolve" | "reject") {
    setMsg(null);
    try { await api(`/api/admin/grievances/${g.id}`, { body: { action, reply: reply[g.id] } }); setMsg({ tone: "success", text: `${g.refNo}: ${action === "progress" ? "marked in progress" : action === "resolve" ? "resolved, reply sent" : "rejected, reply sent"}.` }); q.reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  return (
    <>
      <AdminTitle title="Complaints to the Grievance Officer" sub="Each complaint is acknowledged automatically with a reference number. Reply within 15 days — within 24 hours for intimate images or impersonation (IT Rules 2021). Soonest deadline first." />
      <div className="mb-4 flex gap-2">
        {(["open", "closed"] as const).map((t) => <button key={t} className={t === tab ? "btn-primary px-4 py-1.5 text-sm" : "btn-outline px-4 py-1.5 text-sm"} onClick={() => setTab(t)}>{t === "open" ? "Open" : "Closed"}</button>)}
      </div>
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {q.error && <Alert tone="error">{q.error.message}</Alert>}
      {!q.data && !q.error && <Spinner />}
      {q.data && !q.data.grievances.length && <p className="text-ink-soft">No {tab} complaints.</p>}
      <div className="grid gap-3">
        {q.data?.grievances.map((g) => (
          <div key={g.id} className={`panel p-4 ${g.overdue ? "border-2 border-rose" : g.category === "INTIMATE_OR_IMPERSONATION" && !g.resolvedAt ? "border-2 border-marigold-deep" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div><span className="font-mono text-sm">{g.refNo}</span> · <strong>{g.categoryLabel}</strong></div>
              <div className={`text-sm font-semibold ${g.overdue ? "text-rose" : "text-ink-soft"}`}>{due(g)} · {g.status.replace("_", " ").toLowerCase()}</div>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{g.name} · {g.email}{g.hasAccount ? " · has an account" : ""} · filed {timeAgo(g.createdAt)}</p>
            <p className="mt-3 whitespace-pre-wrap">{g.details}</p>
            {g.resolution && <p className="mt-3 rounded-xl bg-paper-sunk p-3 text-sm"><strong>Reply sent:</strong> {g.resolution}</p>}
            {!g.resolvedAt && (
              <div className="mt-3 space-y-2">
                <textarea aria-label={`Reply to ${g.refNo}`} className="input min-h-24" placeholder="Reply to the person (sent by email when you resolve or reject)" value={reply[g.id] ?? ""} onChange={(e) => setReply({ ...reply, [g.id]: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  {g.status !== "IN_PROGRESS" && <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => act(g, "progress")}>Mark in progress</button>}
                  <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => act(g, "resolve")}>Resolve and send reply</button>
                  <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => act(g, "reject")}>Reject with reason</button>
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
  return <AdminShell><Grievances /></AdminShell>;
}
