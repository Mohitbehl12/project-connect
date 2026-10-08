"use client";
import { useState } from "react";
import { AppShell, PageHeader, useMe } from "@/components/AppShell";
import { Alert, Spinner } from "@/components/ui";
import { api, formatMoney, useApi } from "@/lib/client";

type Plan = { code: string; name: string; features: Record<string, any>; price: { id: string; currency: string; amountMinor: number; listMinor: number; durationDays: number } | null };

const FEATURE_ROWS: [string, (f: any) => string | boolean][] = [
  ["Likes per day", (f) => (f.dailyLikes < 0 ? "Unlimited" : String(f.dailyLikes))],
  ["Priority likes with a note", (f) => `${f.dailyPriorityLikes} a day`],
  ["See everyone who likes you", (f) => f.seeWhoLiked],
  ["Advanced filters", (f) => f.advancedFilters],
  ["Incognito mode", (f) => f.incognito],
  ["Travel mode", (f) => f.travelMode],
  ["Profile boosts", (f) => (f.monthlyBoosts ? `${f.monthlyBoosts} a month` : false)],
];

function Plans() {
  const { reload } = useMe();
  const { data, loading, reload: reloadPlans } = useApi<{ current: { code: string; endsAt: string | null }; plans: Plan[] }>("/api/plans");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function subscribe(p: Plan) {
    setMsg(null);
    try {
      await api("/api/subscriptions", { body: { action: "subscribe", priceId: p.price!.id } });
      setMsg({ tone: "success", text: `${p.name} is active.` });
      reload(); reloadPlans();
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  async function cancel() {
    try {
      const r = await api("/api/subscriptions", { body: { action: "cancel" } });
      setMsg({ tone: "success", text: `Cancelled. Your benefits continue until ${new Date(r.accessUntil).toLocaleDateString()}.` });
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Plans" sub="Everything you need to meet someone is free. Paid plans add reach and control." />
      <div className="px-4 md:px-8">
        <div className="mb-6"><Alert tone="info">Test mode: checkout activates plans instantly without charging. Live payments use Razorpay in India and Stripe elsewhere.</Alert></div>
        {msg && <div className="mb-6"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
        {loading && <Spinner />}
        <div className="grid gap-4 md:grid-cols-4">
          {data?.plans.map((p) => {
            const current = data.current.code === p.code;
            return (
              <div key={p.code} className={`panel flex flex-col p-5 ${p.code === "PREMIUM_PLUS" ? "border-2 border-ink" : ""}`}>
                <h2 className="text-xl font-extrabold">{p.name}</h2>
                <p className="mt-2 font-display text-3xl font-extrabold">
                  {p.price ? formatMoney(p.price.amountMinor, p.price.currency) : "Free"}
                </p>
                <p className="text-sm text-ink-faint">{p.price ? `every ${p.price.durationDays} days` : "always"}</p>
                {p.price && p.price.listMinor > p.price.amountMinor && <p className="text-sm text-ink-faint line-through">{formatMoney(p.price.listMinor, p.price.currency)}</p>}
                <ul className="my-5 flex-1 space-y-2 text-[15px]">
                  {FEATURE_ROWS.map(([label, fn]) => {
                    const v = fn(p.features);
                    return (
                      <li key={label} className={`flex gap-2 ${v === false ? "text-ink-faint line-through decoration-mist" : ""}`}>
                        <span aria-hidden className={v === false ? "" : "text-sage"}>{v === false ? "–" : "✓"}</span>
                        <span>{label}{typeof v === "string" ? `: ${v}` : ""}</span>
                      </li>
                    );
                  })}
                </ul>
                {current ? (
                  <div className="space-y-2">
                    <p className="rounded-pill bg-sage-wash py-2 text-center text-sm font-semibold text-sage">Current plan</p>
                    {p.code !== "FREE" && <button className="btn-ghost w-full text-sm" onClick={cancel}>Cancel renewal</button>}
                  </div>
                ) : p.price ? (
                  <button className={p.code === "PREMIUM_PLUS" ? "btn-accent" : "btn-outline"} onClick={() => subscribe(p)}>Choose {p.name}</button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <AppShell><Plans /></AppShell>;
}
