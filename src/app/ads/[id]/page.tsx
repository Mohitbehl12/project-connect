"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AdsShell, CampaignStatus, useAccount, type Campaign, type Totals } from "@/components/ads/AdsShell";
import { AdCard, MiniChart, inr } from "@/components/ads/AdCard";
import { Alert, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";

type Data = { campaign: Campaign; media: Record<string, string>; stats: { totals: Totals; daily: { day: string; impressions: number; clicks: number; spend: number }[] } };

function Detail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { account, reload } = useAccount();
  const q = useApi<Data>(`/api/ads/campaigns/${id}`);
  const meta = useApi<{ ctas: Record<string, string> }>("/api/ads/meta");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (q.error) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  const { campaign: c, media, stats } = q.data;
  const t = stats.totals;
  const n = (x: number) => x.toLocaleString("en-IN");
  async function act(fn: () => Promise<any>, ok: string) {
    setMsg(null);
    try { const r = await fn(); setMsg({ tone: "success", text: r?.message ?? ok }); q.reload(); reload(); } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm"><Link href="/ads" className="underline">Dashboard</Link> ›</p>
          <h1 className="text-3xl font-extrabold">{c.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft"><CampaignStatus value={c.status} /> {c.pricing} · {c.pricing === "FIXED" ? "fixed placement" : `${inr(c.dailyBudgetMinor)}/day`}{c.startAt && ` · from ${new Date(c.startAt).toLocaleDateString("en-IN")}`}{c.endAt && ` to ${new Date(c.endAt).toLocaleDateString("en-IN")}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["DRAFT", "REJECTED"].includes(c.status) && <button className="btn-primary" onClick={() => act(() => api(`/api/ads/campaigns/${c.id}/submit`, { method: "POST" }), "Submitted for review.")}>Submit for review</button>}
          {["ACTIVE", "APPROVED"].includes(c.status) && <button className="btn-outline" onClick={() => act(() => api(`/api/ads/campaigns/${c.id}/pause`, { body: { paused: true } }), "Paused. It stops showing straight away.")}>Pause</button>}
          {c.status === "PAUSED" && <button className="btn-primary" onClick={() => act(() => api(`/api/ads/campaigns/${c.id}/pause`, { body: { paused: false } }), "Resumed.")}>Resume</button>}
          {c.status !== "COMPLETED" && <Link href={`/ads/${c.id}/edit`} className="btn-outline">Edit</Link>}
          {["DRAFT", "REJECTED"].includes(c.status) && <button className="btn-ghost text-rose" onClick={() => act(async () => { await api(`/api/ads/campaigns/${c.id}`, { method: "DELETE" }); router.push("/ads"); }, "Deleted.")}>Delete draft</button>}
        </div>
      </div>
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {c.status === "REJECTED" && <div className="mb-4"><Alert tone="error">{c.rejection} Edit the ad and submit it again.</Alert></div>}
      {c.status === "PENDING_REVIEW" && <div className="mb-4"><Alert tone="info">Waiting for review — usually within one working day. We'll notify you.</Alert></div>}
      {c.status === "ACTIVE" && account.advertiser.balanceMinor <= 0 && c.pricing !== "FIXED" && <div className="mb-4"><Alert tone="warn">Your balance is empty, so this ad isn't showing. <Link href="/ads/billing" className="underline">Add balance</Link>.</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Impressions", n(t.impressions)], ["Unique reach", n(t.reach)], ["Clicks", n(t.clicks)], ["CTR", `${t.ctr.toFixed(2)}%`],
              ["Video views", n(t.videoViews)], ["Conversions", n(t.conversions)], ["Spend", inr(t.spendMinor)], ["Cost per click", t.clicks ? inr(t.cpcMinor) : "—"],
              ["Cost per conversion", t.conversions ? inr(t.cpaMinor) : "—"], ["Remaining budget", c.remainingMinor === null ? "No limit" : inr(c.remainingMinor)], ["Hidden by", n(t.hides)], ["Total spent", inr(c.spentMinor)],
            ].map(([k, v]) => <div key={k} className="panel p-3"><p className="text-xs text-ink-soft">{k}</p><p className="font-display text-xl font-extrabold">{v}</p></div>)}
          </div>
          <p className="mt-2 text-xs text-ink-faint">Last 60 days. Engagement = clicks + video views + conversions. All figures are totals; nobody's identity is ever shown.</p>
          <div className="mt-4 grid gap-4">
            <MiniChart label="Impressions" data={stats.daily.map((d) => ({ day: d.day, value: d.impressions }))} />
            <MiniChart label="Clicks" color="#1F7A6B" data={stats.daily.map((d) => ({ day: d.day, value: d.clicks }))} />
            <MiniChart label="Spend" color="#7B2FB0" format={inr} data={stats.daily.map((d) => ({ day: d.day, value: d.spend }))} />
          </div>

          <section className="panel mt-6 p-5">
            <h2 className="text-lg font-bold">Conversion tracking (optional)</h2>
            <p className="mt-1 text-sm text-ink-soft">When someone taps your ad, we add <code>kn_click=…</code> to your website address. It's a random code — it doesn't say who they are. When they buy or sign up, send it back to us:</p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-3 text-xs text-paper">{`<!-- On your thank-you page -->
<img src="${origin}/api/ads/convert?key=${c.conversionKey}&click=KN_CLICK_VALUE" width="1" height="1" alt="">

# Or from your server
curl -X POST "${origin}/api/ads/convert?key=${c.conversionKey}&click=KN_CLICK_VALUE"`}</pre>
            <p className="mt-2 text-xs text-ink-faint">Replace KN_CLICK_VALUE with the kn_click value from the landing page address. Conversions count for 30 days after the click. Keep the key private.</p>
          </section>
        </div>
        <aside>
          <p className="label">Your ad</p>
          <AdCard preview ad={{ id: c.id, headline: c.creative.headline, description: c.creative.description, cta: meta.data?.ctas[c.creative.cta] ?? "Learn more", advertiser: { name: account.advertiser.businessName, verified: account.advertiser.verification !== "UNVERIFIED" }, logo: c.creative.logoKey ? media[c.creative.logoKey] : null, images: c.creative.imageKeys.map((k) => media[k]).filter(Boolean), video: c.creative.videoKey ? media[c.creative.videoKey] : null, hasLink: !!c.creative.url }} />
          {c.creative.url && <p className="mt-2 break-all text-xs text-ink-faint">Goes to {c.creative.url}</p>}
        </aside>
      </div>
    </>
  );
}

export default function Page() {
  return <AdsShell><Detail /></AdsShell>;
}
