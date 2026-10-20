"use client";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

// Hosted pay page for Kinara Style clothing orders (opened from the app). Razorpay collects card / UPI /
// bank details on its own secure form; this page never sees them. TEST MODE shows a labelled stand-in.

type Info = { order: { id: string; priceMinor: number; currency: string; description: string; paymentStatus: string }; provider: string; razorpay: Record<string, unknown> | null };
const money = (m: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(m / 100);
declare global { interface Window { Razorpay?: any } }

export default function Page() { return <Suspense fallback={null}><Pay /></Suspense>; }

function Pay() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get("t") ?? "";
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<"ready" | "working" | "done" | "error">("ready");
  const [message, setMessage] = useState("");
  const q = `?t=${encodeURIComponent(token)}`;
  const load = useCallback(async () => {
    const r = await fetch(`/api/style/orders/${id}/pay${q}`); const j = await r.json();
    if (!r.ok) { setState("error"); setMessage(j.error); return; }
    setInfo(j); if (j.order.paymentStatus !== "PENDING") setState("done");
  }, [id, q]);
  useEffect(() => { load(); }, [load]);
  const post = async (body: unknown) => {
    const r = await fetch(`/api/style/orders/${id}/pay${q}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) { setState("error"); setMessage(j.error); return; }
    setState("done");
  };
  function payRazorpay() {
    if (!info?.razorpay) return;
    setState("working");
    const open = () => {
      const rzp = new window.Razorpay({ ...info.razorpay, handler: (resp: Record<string, string>) => post({ action: "verify", paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }), modal: { ondismiss: () => setState("ready") } });
      rzp.on("payment.failed", () => { setState("error"); setMessage("Your bank or card may have declined the payment. No money was taken."); });
      rzp.open();
    };
    if (window.Razorpay) return open();
    const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = open;
    s.onerror = () => { setState("error"); setMessage("Couldn't load the secure payment form. Check your connection and try again."); };
    document.body.appendChild(s);
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 bg-paper px-5 py-8 text-ink">
      <p className="font-display text-xl font-extrabold">Kinara Style</p>
      {!info && state !== "error" && <p className="text-ink-soft">Loading…</p>}
      {state === "error" && <div className="panel p-5"><p className="font-bold">Something went wrong</p><p className="mt-1 text-ink-soft">{message}</p><a className="btn btn-primary mt-4" href="kinara://style">Back to the app</a></div>}
      {info && state !== "error" && (
        <>
          {info.provider === "MOCK" && <div role="note" className="rounded-xl border-2 border-dashed border-marigold bg-marigold/10 p-3 text-sm font-semibold">TEST MODE — no real money moves. Real payments open Razorpay&apos;s secure form here.</div>}
          <div className="panel p-5">
            <p className="text-sm text-ink-soft">Order {info.order.id}</p>
            <p className="font-display text-4xl font-extrabold">{money(info.order.priceMinor)}</p>
            <p className="mt-2 text-sm text-ink-soft">{info.order.description}</p>
            <p className="mt-2 text-sm text-ink-soft">One payment. Made to your measurements; the delivery date is confirmed after payment.</p>
          </div>
          {state === "done" ? (
            <div className="panel p-5 text-center"><p className="text-3xl">🧵</p><p className="font-display text-2xl font-extrabold">Order confirmed</p><p className="mt-1 text-ink-soft">Track it in Kinara Style → Orders.</p><a className="btn btn-primary mt-4 w-full" href="kinara://style">Back to Kinara</a></div>
          ) : state === "working" ? (
            <div className="panel p-5"><p className="font-bold">Confirming with your bank…</p></div>
          ) : info.provider === "MOCK" ? (
            <button className="btn btn-primary" onClick={() => { setState("working"); void post({ action: "test" }); }}>Pay {money(info.order.priceMinor)} (test)</button>
          ) : (
            <button className="btn btn-primary" onClick={payRazorpay}>Pay {money(info.order.priceMinor)} securely</button>
          )}
        </>
      )}
    </main>
  );
}
