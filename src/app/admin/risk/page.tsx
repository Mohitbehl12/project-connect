"use client";
import { useState } from "react";
import Link from "next/link";
import { AdminShell, AdminTitle, useStaff } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { api, timeAgo, useApi } from "@/lib/client";

type Signal = { id: string; kind: string; weight: number; detail: string | null; createdAt: string };
type Risk = { kinds: Record<string, string>; queue: { id: string; email: string; risk: string; status: string; selfie: string; createdAt: string; signals: Signal[] }[]; failedLogins24h: { network: string | null; n: number; accounts: number }[]; webhookFailures: { id: string; eventId: string; type: string; error: string | null; receivedAt: string }[] };
type Referral = { id: string; status: string; reason: string | null; referrer: string; referee: string; refereeRisk: string; createdAt: string; rewardDays: number | null };

function RiskPage() {
  const staff = useStaff();
  const risk = useApi<Risk>(staff.permissions.includes("security.view") ? "/api/admin/billing/risk" : null);
  const refs = useApi<{ referrals: Referral[] }>(staff.permissions.includes("referrals.manage") ? "/api/admin/billing/referrals" : null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  async function clear(userId: string) {
    try { const r = await api(`/api/admin/billing/risk/${userId}`, { body: { note: note[userId] ?? "" } }); setMsg({ tone: "success", text: `Signals cleared — risk is now ${r.level.toLowerCase()}.` }); risk.reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  async function decide(id: string, approve: boolean) {
    try { const r = await api(`/api/admin/billing/referrals/${id}`, { body: { approve } }); setMsg({ tone: "success", text: `Referral ${String(r.status).toLowerCase()}.` }); refs.reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  if (risk.error) return <Alert tone="error">{risk.error.message}</Alert>;
  if (staff.permissions.includes("security.view") && !risk.data) return <Spinner />;
  const held = (refs.data?.referrals ?? []).filter((r) => r.status === "HELD");

  return (
    <>
      <AdminTitle title="Risk & referrals" sub="Signals add up to a Low / Medium / High risk level. High asks the person to verify before paying and lands here. Nothing here bans anyone automatically." />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {risk.data && (
        <>
          <h2 className="mb-3 text-xl font-extrabold">Accounts to review ({risk.data.queue.length})</h2>
          {!risk.data.queue.length && <p className="text-ink-soft">Nothing to review right now.</p>}
          <div className="grid gap-3">
            {risk.data.queue.map((u) => (
              <div key={u.id} className="panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.risk === "HIGH" ? "bg-rose-wash text-rose" : "bg-marigold-wash text-ink"}`}>{u.risk === "HIGH" ? "⚠ High" : "Medium"}</span>
                  <Link href={`/admin/users/${u.id}`} className="font-semibold underline">{u.email}</Link>
                  <span className="text-sm text-ink-faint">joined {timeAgo(u.createdAt)} · {u.status.toLowerCase()} · selfie {u.selfie.toLowerCase()}</span>
                </div>
                <ul className="mt-2 space-y-1 text-sm">{u.signals.map((s) => <li key={s.id}>• {risk.data!.kinds[s.kind] ?? s.kind} <span className="text-ink-faint">(+{s.weight}) {s.detail} · {timeAgo(s.createdAt)}</span></li>)}</ul>
                {staff.permissions.includes("risk.resolve") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input className="input max-w-md flex-1" placeholder="What you checked (kept in the audit log)" value={note[u.id] ?? ""} onChange={(e) => setNote({ ...note, [u.id]: e.target.value })} />
                    <button className="btn-outline" disabled={(note[u.id] ?? "").trim().length < 3} onClick={() => clear(u.id)}>Clear signals</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="panel p-5">
              <h2 className="font-bold">Failed sign-ins by network, last 24 hours</h2>
              {!risk.data.failedLogins24h.length && <p className="mt-2 text-sm text-ink-soft">None.</p>}
              <ul className="mt-2 space-y-1 text-sm">{risk.data.failedLogins24h.map((f) => <li key={f.network ?? "?"} className="flex justify-between"><span className="font-mono">{f.network ?? "unknown"}</span><span>{f.n} attempts · {f.accounts} accounts</span></li>)}</ul>
            </div>
            <div className="panel p-5">
              <h2 className="font-bold">Payment webhooks that failed</h2>
              {!risk.data.webhookFailures.length && <p className="mt-2 text-sm text-ink-soft">None — every gateway event was processed.</p>}
              <ul className="mt-2 space-y-1 text-sm">{risk.data.webhookFailures.map((w) => <li key={w.id}>{w.type} · {timeAgo(w.receivedAt)} <span className="text-rose">{w.error}</span></li>)}</ul>
            </div>
          </div>
        </>
      )}
      {refs.data && (
        <>
          <h2 className="mb-3 mt-8 text-xl font-extrabold">Referrals held for review ({held.length})</h2>
          {!held.length && <p className="text-ink-soft">No referrals waiting.</p>}
          <ul className="grid gap-2">
            {held.map((r) => (
              <li key={r.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
                <div><p className="font-semibold">{r.referrer} invited {r.referee}</p><p className="text-sm text-ink-soft">{r.reason} · friend risk {r.refereeRisk.toLowerCase()} · {timeAgo(r.createdAt)}</p></div>
                <div className="flex gap-2"><button className="btn-primary" onClick={() => decide(r.id, true)}>Reward</button><button className="btn-ghost" onClick={() => decide(r.id, false)}>Reject</button></div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-soft">All referrals: {refs.data.referrals.length} · rewarded {refs.data.referrals.filter((r) => r.status === "REWARDED").length} · rejected {refs.data.referrals.filter((r) => r.status === "REJECTED").length}</p>
        </>
      )}
    </>
  );
}

export default function Page() {
  return <AdminShell><RiskPage /></AdminShell>;
}
