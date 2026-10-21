"use client";
import Script from "next/script";
import { useState } from "react";
import { AdsShell, useAccount } from "@/components/ads/AdsShell";
import { inr } from "@/components/ads/AdCard";
import { Alert, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";

type Tx = { id: string; kind: string; status: string; amountMinor: number; provider: string | null; receiptNo: string | null; note: string | null; createdAt: string; paidAt: string | null };
const KIND: Record<string, string> = { TOPUP: "Balance added", REFUND: "Refund", FIXED_PLACEMENT: "Fixed placement", ADJUSTMENT: "Adjustment" };
declare global { interface Window { Razorpay?: any } }

function Billing() {
  const { account, reload } = useAccount();
  const q = useApi<{ balanceMinor: number; transactions: Tx[] }>("/api/ads/billing");
  const [amount, setAmount] = useState("2000");
  const [refund, setRefund] = useState({ amount: "", reason: "" });
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const done = (text: string) => { setMsg({ tone: "success", text }); q.reload(); reload(); setBusy(false); };

  async function topup() {
    setMsg(null); setBusy(true);
    try {
      const r = await api<any>("/api/ads/topups", { body: { amountMinor: Math.round(Number(amount) * 100) } });
      if (r.provider === "TEST") {
        await api(`/api/ads/topups/${r.id}`, { body: { test: true } });
        return done(`TEST MODE: ₹${amount} added without a real payment.`);
      }
      if (!window.Razorpay) throw new Error("The payment window didn't load. Check your connection and try again.");
      new window.Razorpay({
        key: r.keyId, order_id: r.orderId, amount: r.amountMinor, currency: "INR", name: "Kinara Ads", description: "Advertising balance", prefill: { email: r.email },
        handler: async (p: { razorpay_payment_id: string; razorpay_signature: string }) => {
          try { await api(`/api/ads/topups/${r.id}`, { body: { paymentId: p.razorpay_payment_id, signature: p.razorpay_signature } }); done(`Payment received. ₹${amount} added to your balance.`); }
          catch (e: any) { setMsg({ tone: "error", text: e.message }); setBusy(false); }
        },
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); setBusy(false); }
  }
  async function askRefund(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { const r = await api<{ message: string }>("/api/ads/refunds", { body: { amountMinor: Math.round(Number(refund.amount) * 100), reason: refund.reason } }); setRefund({ amount: "", reason: "" }); done(r.message); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <h1 className="text-3xl font-extrabold">Billing</h1>
      {msg && <div className="mt-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="panel p-5">
          <p className="text-sm text-ink-soft">Advertising balance</p>
          <p className="font-display text-4xl font-extrabold">{inr(account.advertiser.balanceMinor)}</p>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="text-sm"><span className="label">Add (₹)</span><input type="number" min={500} step={100} className="input w-36" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            {["1000", "5000", "10000"].map((a) => <button key={a} type="button" className="btn-outline px-3 py-2 text-sm" onClick={() => setAmount(a)}>₹{Number(a).toLocaleString("en-IN")}</button>)}
          </div>
          <button className="btn-primary mt-4 w-full" disabled={busy} onClick={topup}>{busy ? "Processing…" : `Pay ₹${Number(amount || 0).toLocaleString("en-IN")}`}</button>
          <p className="mt-2 text-xs text-ink-faint">Paid securely through Razorpay (cards, UPI, net banking). Kinara never sees or stores your card details. GST included where it applies; a receipt is issued for every payment.</p>
        </section>
        <section className="panel p-5">
          <h2 className="font-bold">Request a refund</h2>
          <p className="text-sm text-ink-soft">You can ask for unused balance back at any time. Reviewed within 7 working days and paid to the original method. See the <a className="underline" href="/legal/advertising">Advertising Terms</a>.</p>
          <form className="mt-3 space-y-2" onSubmit={askRefund}>
            <input type="number" min={1} className="input" placeholder="Amount (₹)" aria-label="Refund amount" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
            <textarea className="input min-h-16" placeholder="Reason" aria-label="Refund reason" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} />
            <button className="btn-outline" disabled={!refund.amount || refund.reason.trim().length < 5}>Request refund</button>
          </form>
        </section>
      </div>
      <h2 className="mt-8 text-xl font-bold">Transactions</h2>
      {!q.data ? <Spinner /> : !q.data.transactions.length ? <p className="mt-2 text-ink-soft">No transactions yet.</p> : (
        <div className="panel mt-3 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="border-b border-mist text-left text-ink-soft"><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3 text-right">Amount</th><th className="p-3">Receipt</th></tr></thead>
            <tbody>
              {q.data.transactions.map((t) => (
                <tr key={t.id} className="border-b border-mist last:border-0">
                  <td className="p-3">{new Date(t.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="p-3">{KIND[t.kind] ?? t.kind}{t.provider === "TEST" && <span className="ml-1 rounded bg-marigold-wash px-1 text-xs">TEST</span>}{t.note && <span className="block text-xs text-ink-faint">{t.note}</span>}</td>
                  <td className="p-3">{t.status.toLowerCase()}</td>
                  <td className={`p-3 text-right font-semibold ${t.amountMinor < 0 ? "text-rose" : ""}`}>{t.amountMinor < 0 ? "−" : ""}{inr(Math.abs(t.amountMinor))}</td>
                  <td className="p-3">{t.receiptNo && t.status === "PAID" ? <a className="underline" href={`/api/ads/receipts/${t.id}`}>{t.receiptNo} (PDF)</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <AdsShell><Billing /></AdsShell>;
}
