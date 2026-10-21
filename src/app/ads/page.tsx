"use client";
import Link from "next/link";
import { AdsShell, CampaignStatus, useAccount } from "@/components/ads/AdsShell";
import { MiniChart, inr } from "@/components/ads/AdCard";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
      {sub && <p className="text-xs text-ink-faint">{sub}</p>}
    </div>
  );
}

function Dashboard() {
  const { account } = useAccount();
  const { counts, stats, campaigns, advertiser } = account;
  const t = stats.totals;
  const n = (x: number) => x.toLocaleString("en-IN");
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Dashboard</h1>
          <p className="text-ink-soft">Last 30 days · all campaigns. Numbers are totals — you never see who saw your ads.</p>
        </div>
        <Link href="/ads/new" className="btn-primary px-6 py-3 text-base">+ Create Advertisement</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Total campaigns" value={n(counts.total)} />
        <Kpi label="Active" value={n(counts.active)} />
        <Kpi label="Scheduled" value={n(counts.scheduled)} />
        <Kpi label="Drafts" value={n(counts.drafts)} sub={counts.pending ? `${counts.pending} in review` : undefined} />
        <Kpi label="Completed" value={n(counts.completed)} />
        <Kpi label="Balance" value={inr(advertiser.balanceMinor)} sub={<Link href="/ads/billing" className="underline">Add balance</Link>} />
      </div>
      <h2 className="mt-8 text-xl font-bold">Campaign performance</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Impressions" value={n(t.impressions)} sub={`${n(t.reach)} unique people`} />
        <Kpi label="Clicks" value={n(t.clicks)} />
        <Kpi label="CTR" value={`${t.ctr.toFixed(2)}%`} />
        <Kpi label="Spend" value={inr(t.spendMinor)} sub={t.clicks ? `${inr(t.cpcMinor)} per click` : undefined} />
        <Kpi label="Conversions" value={n(t.conversions)} sub={t.conversions ? `${inr(t.cpaMinor)} each` : undefined} />
        <Kpi label="Video views" value={n(t.videoViews)} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <MiniChart label="Impressions" data={stats.daily.map((d) => ({ day: d.day, value: d.impressions }))} />
        <MiniChart label="Spend" color="#7B2FB0" format={inr} data={stats.daily.map((d) => ({ day: d.day, value: d.spend }))} />
      </div>

      <h2 className="mt-8 text-xl font-bold">Campaigns</h2>
      {!campaigns.length ? (
        <div className="panel mt-3 p-8 text-center">
          <p className="text-lg font-semibold">No campaigns yet</p>
          <p className="mt-1 text-ink-soft">Create your first advertisement — it takes about five minutes.</p>
          <Link href="/ads/new" className="btn-primary mt-4">+ Create Advertisement</Link>
        </div>
      ) : (
        <div className="panel mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-mist text-left text-ink-soft"><th className="p-3">Campaign</th><th className="p-3">Status</th><th className="p-3">Pricing</th><th className="p-3 text-right">Daily budget</th><th className="p-3 text-right">Spent</th><th className="p-3 text-right">Remaining</th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-mist last:border-0">
                  <td className="p-3"><Link href={`/ads/${c.id}`} className="font-semibold underline-offset-2 hover:underline">{c.name}</Link></td>
                  <td className="p-3"><CampaignStatus value={c.status} /></td>
                  <td className="p-3">{c.pricing}</td>
                  <td className="p-3 text-right">{c.pricing === "FIXED" ? "—" : inr(c.dailyBudgetMinor)}</td>
                  <td className="p-3 text-right">{inr(c.spentMinor)}</td>
                  <td className="p-3 text-right">{c.remainingMinor === null ? "No limit" : inr(c.remainingMinor)}</td>
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
  return <AdsShell><Dashboard /></AdsShell>;
}
