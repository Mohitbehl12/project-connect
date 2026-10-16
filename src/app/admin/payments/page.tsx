"use client";
import { useState } from "react";
import { AdminShell, AdminTitle, useStaff } from "@/components/AdminShell";
import { Alert, Modal, Spinner } from "@/components/ui";
import { api, formatMoney, timeAgo, useApi } from "@/lib/client";

type Amt = { currency: string; amountMinor: number; n?: number };
type Stats = {
  revenue: { total: Amt[]; today: Amt[]; month: Amt[] }; active: number; trialing: number; pastDue: number; newSubscriptions30d: number;
  trialToPaid: { endedIntros: number; renewed: number; rate: number | null }; failedPayments30d: number; refunds: Amt[]; chargebacks: number;
  couponsUsed: { code: string; n: number }[]; byPlan: (Amt & { plan: string })[]; byCountry: (Amt & { country: string | null })[];
  byCampaign: (Amt & { offer: string | null; coupon: string | null })[]; daily: (Amt & { d: string })[];
};
type Payment = { id: string; email: string; status: string; purpose: string; plan: string; amountMinor: number; currency: string; refundedMinor: number; couponCode: string | null; method: string | null; provider: string; providerPaymentId: string | null; gatewayRef: string | null; invoiceNo: string | null; failureReason: string | null; disputed: boolean; createdAt: string; openRefund: string | null };
type Refund = { id: string; email: string; invoiceNo: string | null; amountMinor: number; currency: string; reason: string; revokeAccess: boolean; status: string; requestedBy: string; requestedById: string; decidedBy: string | null; createdAt: string };

const sumIn = (rows: Amt[], cur = "INR") => rows.filter((r) => r.currency === cur).reduce((a, r) => a + Number(r.amountMinor), 0);
const money = (rows: Amt[]) => (rows.length ? rows.map((r) => formatMoney(Number(r.amountMinor), r.currency)).join(" + ") : "—");

function Kpi({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
      {note && <p className="text-xs text-ink-faint">{note}</p>}
    </div>
  );
}

/** Daily INR revenue, 30 days. Single series (no legend), 4px rounded caps, 2px gaps, hover tooltip, table view. */
function RevenueChart({ rows }: { rows: (Amt & { d: string })[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() + 5.5 * 3600_000 - (29 - i) * 86400_000).toISOString().slice(0, 10));
  const val = new Map(rows.filter((r) => r.currency === "INR").map((r) => [r.d, Number(r.amountMinor)]));
  const series = days.map((d) => ({ d, v: val.get(d) ?? 0 }));
  const max = Math.max(...series.map((s) => s.v), 100);
  const step = Math.pow(10, Math.floor(Math.log10(max / 100))) * 100;
  const top = Math.ceil(max / step / 4) * step * 4 || 400;
  const H = 160, W = 30 * 22;
  const total = series.reduce((a, s) => a + s.v, 0);
  return (
    <div className="panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-bold">Revenue per day (INR), last 30 days</h2>
          <p className="text-sm text-ink-soft">{formatMoney(total, "INR")} net of refunds · India time</p>
        </div>
        <button className="text-sm font-semibold underline" onClick={() => setTable(!table)}>{table ? "Show chart" : "Show table"}</button>
      </div>
      {table ? (
        <div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-sm"><tbody>{series.filter((s) => s.v).map((s) => <tr key={s.d} className="border-b border-mist"><td className="py-1">{s.d}</td><td className="py-1 text-right font-semibold">{formatMoney(s.v, "INR")}</td></tr>)}</tbody></table></div>
      ) : (
        <div className="relative mt-4">
          <svg viewBox={`0 0 ${W + 44} ${H + 22}`} className="w-full" role="img" aria-label={`Daily revenue, highest ${formatMoney(Math.max(...series.map((s) => s.v)), "INR")}`}>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={44} x2={W + 44} y1={H - f * H + 4} y2={H - f * H + 4} stroke="#EEE8FF" strokeWidth={1} />
                <text x={38} y={H - f * H + 8} textAnchor="end" fontSize={10} fill="#8A80A6">{f === 0 ? "0" : `₹${((top * f) / 100 >= 1000 ? `${Math.round((top * f) / 100000)}K` : Math.round((top * f) / 100))}`}</text>
              </g>
            ))}
            {series.map((s, i) => {
              const h = (s.v / top) * H;
              const x = 44 + i * 22 + 2, w = 18;
              return (
                <g key={s.d} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={44 + i * 22} y={0} width={22} height={H + 4} fill="transparent" />
                  {h > 0 && <path d={`M${x},${H + 4} V${H + 4 - h + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, h)},-${Math.min(4, h)} H${x + w - Math.min(4, h)} q${Math.min(4, h)},0 ${Math.min(4, h)},${Math.min(4, h)} V${H + 4} Z`} fill={hover === i ? "#5E33A8" : "#7B48CC"} />}
                </g>
              );
            })}
            <line x1={44} x2={W + 44} y1={H + 4} y2={H + 4} stroke="#E2DAF5" strokeWidth={1} />
            <text x={46} y={H + 18} fontSize={10} fill="#8A80A6">{days[0].slice(5)}</text>
            <text x={W + 42} y={H + 18} fontSize={10} fill="#8A80A6" textAnchor="end">today</text>
          </svg>
          {hover !== null && (
            <div className="pointer-events-none absolute -top-2 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-paper shadow" style={{ left: `${((44 + hover * 22 + 11) / (W + 44)) * 100}%`, transform: "translateX(-50%)" }}>
              <p className="font-semibold">{formatMoney(series[hover].v, "INR")}</p><p className="text-paper/70">{series[hover].d}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; amt: number; cur: string; n?: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.amt));
  return (
    <div className="panel p-5">
      <h2 className="font-bold">{title}</h2>
      {!rows.length && <p className="mt-2 text-sm text-ink-soft">No payments yet.</p>}
      <ul className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <li key={r.label + r.cur}>
            <div className="flex justify-between text-sm"><span>{r.label}</span><span className="font-semibold">{formatMoney(r.amt, r.cur)}{r.n ? <span className="font-normal text-ink-faint"> · {r.n}</span> : null}</span></div>
            <div className="mt-1 h-2 rounded-full bg-paper-sunk"><div className="h-2 rounded-full bg-[#7B48CC]" style={{ width: `${(r.amt / max) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Payments() {
  const staff = useStaff();
  const can = (p: string) => staff.permissions.includes(p);
  const stats = useApi<Stats>(can("payments.view") ? "/api/admin/billing/stats" : null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const list = useApi<{ payments: Payment[] }>(can("payments.view") ? `/api/admin/billing/payments?q=${encodeURIComponent(q)}&status=${status}` : null);
  const refunds = useApi<{ refunds: Refund[] }>(can("payments.view") ? "/api/admin/billing/refunds" : null);
  const [refundFor, setRefundFor] = useState<Payment | null>(null);
  const [form, setForm] = useState({ amount: "", reason: "", revoke: false });
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (!can("payments.view")) return <Alert tone="error">You don&apos;t have access to payments.</Alert>;
  if (stats.error) return <Alert tone="error">{stats.error.message}</Alert>;
  if (!stats.data) return <Spinner />;
  const s = stats.data;

  async function submitRefund() {
    if (!refundFor) return;
    try {
      await api("/api/admin/billing/refunds", { body: { paymentId: refundFor.id, amountMinor: Math.round(Number(form.amount) * 100), reason: form.reason, revokeAccess: form.revoke } });
      setMsg({ tone: "success", text: "Refund requested. Someone else with refund approval must approve it." });
      setRefundFor(null); refunds.reload(); list.reload();
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  async function decide(id: string, approve: boolean) {
    try {
      const r = await api(`/api/admin/billing/refunds/${id}`, { body: { approve, note: approve ? "Approved" : "Rejected" } });
      setMsg({ tone: "success", text: `Refund ${String(r.status).toLowerCase()}.` });
      refunds.reload(); list.reload(); stats.reload();
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }

  const pending = (refunds.data?.refunds ?? []).filter((r) => r.status === "REQUESTED");
  return (
    <>
      <AdminTitle title="Payments" sub="Revenue is net of refunds. Card numbers, UPI IDs and bank details are never stored here — the gateway holds them." />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Revenue today" value={money(s.revenue.today)} />
        <Kpi label="Revenue this month" value={money(s.revenue.month)} />
        <Kpi label="Total revenue" value={money(s.revenue.total)} />
        <Kpi label="Active subscriptions" value={s.active} note={`${s.pastDue} past due · ${s.newSubscriptions30d} new in 30 days`} />
        <Kpi label="In intro period" value={s.trialing} />
        <Kpi label="Intro → paid" value={s.trialToPaid.rate === null ? "—" : `${s.trialToPaid.rate}%`} note={`${s.trialToPaid.renewed} of ${s.trialToPaid.endedIntros} finished intros renewed`} />
        <Kpi label="Failed payments (30 days)" value={s.failedPayments30d} />
        <Kpi label="Refunds · chargebacks" value={`${money(s.refunds)} · ${s.chargebacks}`} />
      </div>
      <div className="mt-6"><RevenueChart rows={s.daily} /></div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Breakdown title="By plan (30 days)" rows={s.byPlan.map((r) => ({ label: r.plan.replace("_", " "), amt: Number(r.amountMinor), cur: r.currency, n: Number(r.n) }))} />
        <Breakdown title="By country (30 days)" rows={s.byCountry.map((r) => ({ label: r.country ?? "Unknown / deleted", amt: Number(r.amountMinor), cur: r.currency }))} />
        <Breakdown title="By campaign (30 days)" rows={s.byCampaign.map((r) => ({ label: r.offer ?? (r.coupon ? `Coupon ${r.coupon}` : "Full price"), amt: Number(r.amountMinor), cur: r.currency, n: Number(r.n) }))} />
      </div>
      {!!s.couponsUsed.length && <p className="mt-3 text-sm text-ink-soft">Coupons used: {s.couponsUsed.map((c) => `${c.code} × ${c.n}`).join(", ")}</p>}

      {pending.length > 0 && (
        <section className="panel mt-8 p-5">
          <h2 className="font-bold">Refunds waiting for approval</h2>
          <ul className="mt-3 divide-y divide-mist">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{formatMoney(r.amountMinor, r.currency)} to {r.email} {r.revokeAccess && <span className="ml-1 rounded bg-rose-wash px-1.5 text-xs text-rose">ends access</span>}</p>
                  <p className="text-sm text-ink-soft">“{r.reason}” · requested by {r.requestedBy} · {timeAgo(r.createdAt)}</p>
                </div>
                {can("payments.refund_approve") && (r.requestedById === staff.id
                  ? <span className="text-sm text-ink-faint">Needs someone else to approve</span>
                  : <div className="flex gap-2"><button className="btn-primary" onClick={() => decide(r.id, true)}>Approve</button><button className="btn-ghost" onClick={() => decide(r.id, false)}>Reject</button></div>)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-xl font-extrabold">All payments</h2>
          <input className="input w-64" placeholder="Email, invoice no. or payment id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search payments" />
          <select className="input w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Any status</option>{["CAPTURED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED", "CREATED"].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-ink-soft"><tr>{["When", "Member", "Plan", "Amount", "Status", "Method", "Invoice", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {(list.data?.payments ?? []).map((p) => (
                <tr key={p.id} className="border-t border-mist">
                  <td className="px-4 py-2.5 text-ink-soft">{timeAgo(p.createdAt)}</td>
                  <td className="px-4 py-2.5">{p.email}</td>
                  <td className="px-4 py-2.5">{p.plan} <span className="text-ink-faint">· {p.purpose.toLowerCase()}</span></td>
                  <td className="px-4 py-2.5 font-semibold">{formatMoney(p.amountMinor, p.currency)}{p.refundedMinor ? <span className="block text-xs font-normal text-rose">−{formatMoney(p.refundedMinor, p.currency)} refunded</span> : null}</td>
                  <td className="px-4 py-2.5">{p.status.replace("_", " ").toLowerCase()}{p.disputed && <span className="ml-1 rounded bg-rose-wash px-1 text-xs text-rose">disputed</span>}{p.failureReason && <span className="block text-xs text-ink-faint">{p.failureReason}</span>}</td>
                  <td className="px-4 py-2.5">{p.method ?? "—"} <span className="text-xs text-ink-faint">{p.provider === "MOCK" ? "test" : p.provider.toLowerCase()}</span></td>
                  <td className="px-4 py-2.5">{p.invoiceNo ? <a className="underline" href={`/api/billing/invoices/${p.id}`} target="_blank" rel="noreferrer">{p.invoiceNo}</a> : "—"}</td>
                  <td className="px-4 py-2.5 text-right">{can("payments.refund_request") && ["CAPTURED", "PARTIALLY_REFUNDED"].includes(p.status) && !p.openRefund &&
                    <button className="text-sm font-semibold underline" onClick={() => { setRefundFor(p); setForm({ amount: String((p.amountMinor - p.refundedMinor) / 100), reason: "", revoke: false }); }}>Refund…</button>}
                    {p.openRefund && <span className="text-xs text-ink-faint">refund pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data && !list.data.payments.length && <p className="p-4 text-ink-soft">No payments match.</p>}
        </div>
      </section>

      <Modal open={!!refundFor} onClose={() => setRefundFor(null)} title="Request a refund">
        {refundFor && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">{refundFor.email} · {formatMoney(refundFor.amountMinor, refundFor.currency)} · {refundFor.invoiceNo}</p>
            <label className="block text-sm font-semibold">Amount ({refundFor.currency})<input className="input mt-1" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
            <label className="block text-sm font-semibold">Reason (kept in the audit log)<textarea className="input mt-1" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.revoke} onChange={(e) => setForm({ ...form, revoke: e.target.checked })} /> Also end their Premium access now</label>
            <p className="text-xs text-ink-faint">A second person with refund approval rights must approve this before money moves.</p>
            <button className="btn-primary w-full" disabled={form.reason.trim().length < 5} onClick={submitRefund}>Request refund</button>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function Page() {
  return <AdminShell><Payments /></AdminShell>;
}
