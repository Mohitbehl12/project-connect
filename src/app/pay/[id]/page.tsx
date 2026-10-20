"use client";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

// Hosted pay page. The app opens it in an in-app browser; the website links to it after checkout review.
// Razorpay collects card / UPI / bank details on its own secure form — this page never sees them.
// In TEST MODE it shows a clearly labelled stand-in so the whole flow can be tried without money.

type Info = {
  payment: { id: string; status: string; amountMinor: number; currency: string; planName: string; failureReason: string | null };
  terms: string[];
  provider: string;
  razorpay: Record<string, unknown> | null;
};

const money = (m: number, c: string) => new Intl.NumberFormat(c === "INR" ? "en-IN" : "en-GB", { style: "currency", currency: c, maximumFractionDigits: m % 100 ? 2 : 0 }).format(m / 100);

function safeReturn(r: string | null) {
  if (!r || r === "web") return "/plans";
  if (r === "app") return "kinara://subscription";
  try {
    const u = new URL(r);
    return ["kinara:", "projectconnect:", "exp:", "exps:"].includes(u.protocol) || u.origin === window.location.origin ? r : "/plans";
  } catch { return "/plans"; }
}

declare global { interface Window { Razorpay?: any } }

export default function PayPage() {
  return <Suspense fallback={null}><Pay /></Suspense>;
}

function Pay() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const token = sp.get("t") ?? "";
  const back = safeReturn(sp.get("return"));
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<"ready" | "working" | "waiting" | "done" | "failed" | "error">("ready");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/billing/pay/${id}?t=${encodeURIComponent(token)}`);
    const j = await r.json();
    if (!r.ok) { setState("error"); setMessage(j.error); return null; }
    setInfo(j);
    if (j.payment.status === "CAPTURED") setState("done");
    return j as Info;
  }, [id, token]);
  useEffect(() => { load(); }, [load]);

  // After checkout, wait for the gateway's webhook to confirm (the only thing that turns Premium on).
  const poll = useCallback(async () => {
    setState("waiting");
    for (let i = 0; i < 30; i++) {
      const r = await fetch(`/api/billing/payments/${id}?t=${encodeURIComponent(token)}`).then((x) => x.json()).catch(() => null);
      const st = r?.payment?.status;
      if (st === "CAPTURED") { setState("done"); return; }
      if (st === "FAILED") { setState("failed"); setMessage(r.payment.failureReason ?? "We couldn't process your payment."); return; }
      await new Promise((res) => setTimeout(res, 2000));
    }
    setState("waiting");
    setMessage("Your bank is taking a little longer. You can close this — we'll notify you as soon as it's confirmed.");
  }, [id, token]);

  async function payTest(outcome: "success" | "fail") {
    setState("working");
    await fetch("/api/billing/mock/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentId: id, token, outcome }) });
    await poll();
  }

  function payRazorpay() {
    if (!info?.razorpay) return;
    setState("working");
    const open = () => {
      const rzp = new window.Razorpay({
        ...info.razorpay,
        handler: async (resp: Record<string, string>) => {
          await fetch("/api/billing/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentId: id, token, providerPaymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }) });
          await poll();
        },
        modal: { ondismiss: () => setState("ready") },
      });
      rzp.on("payment.failed", (e: any) => { setState("failed"); setMessage(e?.error?.description ? "Your bank or card may have declined the payment." : "We couldn't process your payment."); });
      rzp.open();
    };
    if (window.Razorpay) return open();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = open;
    s.onerror = () => { setState("error"); setMessage("Couldn't load the secure payment form. Check your connection and try again."); };
    document.body.appendChild(s);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 bg-paper px-5 py-8 text-ink">
      <p className="font-display text-xl font-extrabold text-ink">Kinara</p>
      {!info && state !== "error" && <p className="text-ink-soft">Loading…</p>}
      {state === "error" && <div className="panel p-5"><p className="font-bold">Something went wrong</p><p className="mt-1 text-ink-soft">{message}</p><a className="btn btn-primary mt-4" href={back}>Back to the app</a></div>}
      {info && state !== "error" && (
        <>
          {info.provider === "MOCK" && (
            <div role="note" className="rounded-xl border-2 border-dashed border-marigold bg-marigold/10 p-3 text-sm font-semibold">
              TEST MODE — no real money moves. Real payments open Razorpay&apos;s secure form here.
            </div>
          )}
          <div className="panel p-5">
            <p className="text-sm text-ink-soft">{info.payment.planName}</p>
            <p className="font-display text-4xl font-extrabold">{money(info.payment.amountMinor, info.payment.currency)}</p>
            <ul className="mt-3 space-y-1 text-sm text-ink-soft">{info.terms.map((t) => <li key={t}>• {t}</li>)}</ul>
          </div>

          {state === "done" ? (
            <div className="panel p-5 text-center">
              <p className="text-3xl">🎉</p>
              <p className="font-display text-2xl font-extrabold">Payment successful</p>
              <p className="mt-1 text-ink-soft">{info.payment.planName} is on. Your receipt and invoice are in the app.</p>
              <a className="btn btn-primary mt-4 w-full" href={back}>Back to Kinara</a>
            </div>
          ) : state === "failed" ? (
            <div className="panel p-5">
              <p className="font-display text-xl font-extrabold">We couldn&apos;t process your payment.</p>
              <p className="mt-1 text-ink-soft">{message} No money was taken for this attempt.</p>
              <div className="mt-4 grid gap-2">
                <button className="btn btn-primary" onClick={() => { setState("ready"); }}>Try again</button>
                <button className="btn btn-ghost" onClick={() => { setState("ready"); }}>Choose another payment method</button>
                <a className="btn btn-ghost" href="mailto:support@example.com">Contact support</a>
              </div>
            </div>
          ) : state === "waiting" || state === "working" ? (
            <div className="panel p-5"><p className="font-bold">Confirming with your bank…</p><p className="mt-1 text-sm text-ink-soft">{message || "This usually takes a few seconds. Please don't close this page."}</p></div>
          ) : info.provider === "MOCK" ? (
            <div className="grid gap-2">
              <button className="btn btn-primary" onClick={() => payTest("success")}>Pay {money(info.payment.amountMinor, info.payment.currency)} (test)</button>
              <button className="btn btn-ghost" onClick={() => payTest("fail")}>Simulate a declined payment</button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={payRazorpay}>Pay securely with UPI, card or net banking</button>
          )}

          <ul className="grid grid-cols-2 gap-2 text-xs text-ink-soft">
            <li>🔒 Card and UPI details stay with Razorpay</li>
            <li>📄 Clear terms before you pay</li>
            <li>❌ Cancel any time in the app</li>
            <li>🧾 Invoice for every payment</li>
          </ul>
          <a className="text-center text-sm text-ink-soft underline" href={back}>Cancel and go back</a>
        </>
      )}
    </main>
  );
}
