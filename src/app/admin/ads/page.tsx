"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { AdminShell, AdminTitle, StatusPill, useStaff } from "@/components/AdminShell";
import { AdCard, inr } from "@/components/ads/AdCard";
import { Alert, Spinner, Toggle } from "@/components/ui";
import { api, timeAgo, useApi } from "@/lib/client";

type Adv = { id: string; businessName: string; contactName: string; email: string; phone: string; category: string; categoryLabel: string; website: string | null; address: string | null; gstin: string | null; verification: string; status: string; balanceMinor: number; createdAt: string };
type Pending = {
  id: string; name: string; objective: string; pricing: string; placements: string; dailyBudgetMinor: number; totalBudgetMinor: number; startAt: string | null; endAt: string | null; autoFlags: string | null; submittedAt: string;
  advertiser: Adv; ctaLabel: string; creative: { headline: string; description: string; cta: string; url: string }; targeting: Record<string, any>; images: string[]; video: string | null; logo: string | null;
};
type Data = {
  totals: Record<string, number>; pending: Pending[];
  campaigns: { id: string; name: string; status: string; pricing: string; placements: string; spentMinor: number; advertiser: string; advertiserId: string; autoFlags: string | null; updatedAt: string }[];
  advertisers: Adv[];
  reports: { id: string; caseNo: string; campaignId: string; campaignName: string; reason: string; details: string; status: string; createdAt: string }[];
  refunds: { id: string; businessName: string; amountMinor: number; status: string; note: string | null; createdAt: string }[];
};
const TABS = ["Pending reviews", "Campaigns", "Advertisers", "Reports", "Refunds", "Pricing"] as const;
const VER: Record<string, string> = { UNVERIFIED: "Unverified", VERIFIED: "Verified business", TRUSTED: "Trusted advertiser" };

function Ads() {
  const staff = useStaff();
  const q = useApi<Data>("/api/admin/ads");
  const [tab, setTab] = useState<(typeof TABS)[number]>("Pending reviews");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function run(fn: () => Promise<any>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ tone: "success", text: ok }); q.reload(); } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  const review = (id: string, action: string, extra: object = {}) => run(() => api(`/api/admin/ads/campaigns/${id}`, { body: { action, note: notes[id] || undefined, ...extra } }), ({ approve: "Approved — the advertiser has been told.", reject: "Rejected — the advertiser has been told and can resubmit.", pause: "Paused.", resume: "Resumed.", delete: "Deleted." } as Record<string, string>)[action] ?? "Done.");
  const advAct = (id: string, action: string) => run(() => api(`/api/admin/ads/advertisers/${id}`, { body: { action, why: notes[id] ?? "" } }), "Done.");
  if (q.error) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  const d = q.data, t = d.totals;
  const n = (x: number) => (x ?? 0).toLocaleString("en-IN");
  return (
    <>
      <AdminTitle title="Ads" sub="Nothing goes live without a person's approval and a verified business. Advertisers only ever see totals." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        {[["Advertisers", n(t.advertisers)], ["Campaigns", n(t.campaigns)], ["Active", n(t.active)], ["Pending reviews", n(t.pending)], ["Rejected", n(t.rejected)], ["Open reports", n(t.openReports)],
          ["Ad revenue (spent)", inr(t.revenueMinor)], ["Balance added", inr(t.topupsMinor)], ["Impressions (30d)", n(t.impressions)], ["Clicks (30d)", n(t.clicks)], ["CTR", `${(t.ctr ?? 0).toFixed(2)}%`], ["Conversions", n(t.conversions)]]
          .map(([k, v]) => <div key={k} className="panel p-3"><p className="text-xs text-ink-soft">{k}</p><p className="font-display text-xl font-extrabold">{v}</p></div>)}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((x) => <button key={x} className={x === tab ? "btn-primary px-4 py-1.5 text-sm" : "btn-outline px-4 py-1.5 text-sm"} onClick={() => setTab(x)}>{x}{x === "Pending reviews" && d.pending.length ? ` (${d.pending.length})` : ""}</button>)}
      </div>
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

      {tab === "Pending reviews" && (
        <div className="grid gap-4">
          {!d.pending.length && <p className="text-ink-soft">Nothing waiting for review.</p>}
          {d.pending.map((p) => (
            <div key={p.id} className="panel grid gap-5 p-4 md:grid-cols-[320px_1fr]">
              <AdCard preview ad={{ id: p.id, headline: p.creative.headline, description: p.creative.description, cta: p.ctaLabel, advertiser: { name: p.advertiser.businessName, verified: p.advertiser.verification !== "UNVERIFIED" }, logo: p.logo, images: p.images, video: p.video, hasLink: !!p.creative.url }} />
              <div className="space-y-2 text-sm">
                <p className="text-lg font-bold">{p.name} <span className="text-sm font-normal text-ink-soft">· submitted {timeAgo(p.submittedAt)}</span></p>
                {p.autoFlags && <Alert tone="warn">Automated checks: {p.autoFlags}</Alert>}
                <p><strong>Business:</strong> {p.advertiser.businessName} ({p.advertiser.categoryLabel}) · {VER[p.advertiser.verification]} · balance {inr(p.advertiser.balanceMinor)}</p>
                <p className="text-ink-soft">{p.advertiser.contactName} · {p.advertiser.email} · {p.advertiser.phone}{p.advertiser.website && <> · <a className="underline" href={p.advertiser.website} target="_blank" rel="noopener noreferrer">{p.advertiser.website}</a></>}{p.advertiser.gstin && ` · GSTIN ${p.advertiser.gstin}`}</p>
                <p><strong>Landing page:</strong> {p.creative.url ? <a className="break-all underline" href={p.creative.url} target="_blank" rel="noopener noreferrer nofollow">{p.creative.url}</a> : "none"}</p>
                <p><strong>Pricing:</strong> {p.pricing} · {p.pricing === "FIXED" ? "fixed" : `${inr(p.dailyBudgetMinor)}/day${p.totalBudgetMinor ? `, ${inr(p.totalBudgetMinor)} total` : ""}`}{p.startAt && ` · ${new Date(p.startAt).toLocaleDateString()}`}{p.endAt && ` → ${new Date(p.endAt).toLocaleDateString()}`}</p>
                <p><strong>Placements:</strong> {p.placements.replace(/,/g, ", ")}</p>
                <p><strong>Targeting:</strong> {[p.targeting.countries?.join(" "), p.targeting.regions?.join(", "), p.targeting.cities?.join(", "), `age ${p.targeting.ageMin}–${p.targeting.ageMax}`, p.targeting.genders?.join("/"), p.targeting.interests?.join(", ")].filter(Boolean).join(" · ")}</p>
                <p className="text-xs text-ink-faint">Check: images and video, text and claims, landing page matches the ad, business identity and licences (regulated categories), targeting is appropriate, payment/balance.</p>
                <textarea className="input min-h-16" placeholder="Internal note (optional)" aria-label="Internal note" value={notes[p.id] ?? ""} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} />
                <input className="input" placeholder="Reason shown to the advertiser if rejected (optional — a general reason is used otherwise)" aria-label="Public reason" value={notes[`pub:${p.id}`] ?? ""} onChange={(e) => setNotes({ ...notes, [`pub:${p.id}`]: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  {p.advertiser.verification === "UNVERIFIED"
                    ? <button className="btn-primary px-3 py-1.5" onClick={() => review(p.id, "approve", { verifyAdvertiser: true })}>Verify business &amp; approve</button>
                    : <button className="btn-primary px-3 py-1.5" onClick={() => review(p.id, "approve")}>Approve</button>}
                  <button className="btn-outline px-3 py-1.5" onClick={() => review(p.id, "reject", { publicReason: notes[`pub:${p.id}`] || undefined })}>Reject</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "Campaigns" && (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-mist text-left text-ink-soft"><th className="p-3">Campaign</th><th className="p-3">Advertiser</th><th className="p-3">Status</th><th className="p-3">Pricing</th><th className="p-3 text-right">Spent</th><th className="p-3">Actions</th></tr></thead>
            <tbody>
              {d.campaigns.map((c) => (
                <tr key={c.id} className="border-b border-mist last:border-0">
                  <td className="p-3 font-semibold">{c.name}<span className="block text-xs font-normal text-ink-faint">{c.placements.replace(/,/g, ", ")} · {timeAgo(c.updatedAt)}</span></td>
                  <td className="p-3">{c.advertiser}</td>
                  <td className="p-3"><StatusPill value={c.status} /></td>
                  <td className="p-3">{c.pricing}</td>
                  <td className="p-3 text-right">{inr(c.spentMinor)}</td>
                  <td className="space-x-1 p-3 whitespace-nowrap">
                    {c.status === "ACTIVE" && <button className="btn-outline px-2 py-1 text-xs" onClick={() => review(c.id, "pause")}>Pause</button>}
                    {c.status === "PAUSED" && <button className="btn-outline px-2 py-1 text-xs" onClick={() => review(c.id, "resume")}>Resume</button>}
                    <button className="btn-ghost px-2 py-1 text-xs text-rose" onClick={() => { if (confirm(`Delete "${c.name}"? Its statistics are deleted too.`)) review(c.id, "delete"); }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.campaigns.length && <p className="p-4 text-ink-soft">No campaigns yet.</p>}
        </div>
      )}

      {tab === "Advertisers" && (
        <div className="grid gap-3">
          {!d.advertisers.length && <p className="text-ink-soft">No advertisers yet.</p>}
          {d.advertisers.map((a) => (
            <div key={a.id} className="panel p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-base font-bold">{a.businessName} <span className="font-normal text-ink-soft">· {a.categoryLabel}</span></p>
                <p>{VER[a.verification]} · <StatusPill value={a.status} /> · balance {inr(a.balanceMinor)}</p>
              </div>
              <p className="mt-1 text-ink-soft">{a.contactName} · {a.email} · {a.phone}{a.website && ` · ${a.website}`}{a.gstin && ` · GSTIN ${a.gstin}`}{a.address && ` · ${a.address}`} · joined {timeAgo(a.createdAt)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className="input max-w-xs py-1.5" placeholder="Reason (for suspension)" aria-label={`Reason for ${a.businessName}`} value={notes[a.id] ?? ""} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} />
                {a.verification !== "VERIFIED" && <button className="btn-outline px-3 py-1 text-xs" onClick={() => advAct(a.id, "verify")}>Mark verified</button>}
                {a.verification !== "TRUSTED" && <button className="btn-outline px-3 py-1 text-xs" onClick={() => advAct(a.id, "trust")}>Mark trusted</button>}
                {a.verification !== "UNVERIFIED" && <button className="btn-ghost px-3 py-1 text-xs" onClick={() => advAct(a.id, "unverify")}>Remove verification</button>}
                {a.status === "ACTIVE" ? <button className="btn-ghost px-3 py-1 text-xs text-rose" onClick={() => advAct(a.id, "suspend")}>Suspend advertiser</button>
                  : <button className="btn-outline px-3 py-1 text-xs" onClick={() => advAct(a.id, "restore")}>Restore</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "Reports" && (
        <div className="grid gap-3">
          {!d.reports.length && <p className="text-ink-soft">No ad reports.</p>}
          {d.reports.map((r) => (
            <div key={r.id} className="panel p-4 text-sm">
              <p><span className="font-mono">{r.caseNo}</span> · <strong>{r.reason.replace(/_/g, " ").toLowerCase()}</strong> · “{r.campaignName}” · {timeAgo(r.createdAt)} · <StatusPill value={r.status} /></p>
              {r.details && <p className="mt-1 whitespace-pre-wrap">{r.details}</p>}
              {r.status === "OPEN" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input className="input max-w-sm py-1.5" placeholder="Resolution (required)" aria-label={`Resolution for ${r.caseNo}`} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <button className="btn-primary px-3 py-1 text-xs" onClick={() => run(async () => { await api(`/api/admin/ads/reports/${r.id}`, { body: { action: "action", resolution: notes[r.id] ?? "" } }); await api(`/api/admin/ads/campaigns/${r.campaignId}`, { body: { action: "pause", note: `Report ${r.caseNo}` } }).catch(() => {}); }, "Actioned; the ad is paused.")}>Uphold &amp; pause ad</button>
                  <button className="btn-outline px-3 py-1 text-xs" onClick={() => run(() => api(`/api/admin/ads/reports/${r.id}`, { body: { action: "dismiss", resolution: notes[r.id] ?? "" } }), "Dismissed.")}>Dismiss</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "Refunds" && (
        <div className="grid gap-3">
          {!d.refunds.length && <p className="text-ink-soft">No refund requests.</p>}
          {!staff.permissions.includes("ads.finance") && <Alert tone="info">Refund decisions need the finance role.</Alert>}
          {d.refunds.map((r) => (
            <div key={r.id} className="panel p-4 text-sm">
              <p><strong>{r.businessName}</strong> asks for {inr(Math.abs(r.amountMinor))} · {timeAgo(r.createdAt)} · <StatusPill value={r.status} /></p>
              {r.note && <p className="mt-1 text-ink-soft">{r.note}</p>}
              {r.status === "REQUESTED" && staff.permissions.includes("ads.finance") && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input className="input max-w-sm py-1.5" placeholder="Note (required)" aria-label="Refund note" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <button className="btn-primary px-3 py-1 text-xs" onClick={() => run(() => api(`/api/admin/ads/refunds/${r.id}`, { body: { approve: true, note: notes[r.id] ?? "" } }), "Refund approved.")}>Approve refund</button>
                  <button className="btn-outline px-3 py-1 text-xs" onClick={() => run(() => api(`/api/admin/ads/refunds/${r.id}`, { body: { approve: false, note: notes[r.id] ?? "" } }), "Refund declined.")}>Decline</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "Pricing" && <PricingSettings canEdit={staff.permissions.includes("config.edit")} />}
    </>
  );
}

function PricingSettings({ canEdit }: { canEdit: boolean }) {
  const q = useApi<{ config: Record<string, any> }>("/api/admin/config");
  const [c, setC] = useState<Record<string, any> | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => { if (q.data && !c) setC(q.data.config); }, [q.data, c]);
  if (!c) return <Spinner />;
  const p = c["ads.pricing"];
  const rupee = (k: string, label: string) => (
    <label className="text-sm"><span className="label">{label} (₹)</span>
      <input type="number" min={0} step="0.01" className="input w-40" value={p[k] / 100} onChange={(e) => setC({ ...c, "ads.pricing": { ...p, [k]: Math.round(Number(e.target.value) * 100) } })} /></label>
  );
  const num = (k: string, label: string, hint: string, money = false) => (
    <label className="text-sm"><span className="label">{label}</span>
      <input type="number" min={0} className="input w-40" value={money ? c[k] / 100 : c[k]} onChange={(e) => setC({ ...c, [k]: money ? Math.round(Number(e.target.value) * 100) : Number(e.target.value) })} />
      <span className="mt-1 block text-xs text-ink-faint">{hint}</span></label>
  );
  return (
    <div className="panel max-w-3xl space-y-5 p-5">
      <Toggle label="Show ads" description="Off hides every ad everywhere straight away." checked={!!c["ads.enabled"]} onChange={(v) => setC({ ...c, "ads.enabled": v })} />
      <div className="flex flex-wrap gap-4">{rupee("cpmMinor", "Per 1,000 views (CPM)")}{rupee("cpcMinor", "Per click (CPC)")}{rupee("cpaMinor", "Per action (CPA)")}{rupee("fixedPerDayMinor", "Fixed placement per day")}</div>
      <div className="flex flex-wrap gap-4">
        {num("ads.frequencyPerCampaignPerDay", "Same ad per member per day", "Spec example: 3")}
        {num("ads.maxPerMemberPerDay", "All ads per member per day", "Keeps ads light")}
        {num("ads.discoverEvery", "Discover: one ad every … profiles", "At least 4")}
        {num("ads.minDailyBudgetMinor", "Minimum daily budget (₹)", "", true)}
        {num("ads.minTopupMinor", "Minimum top-up (₹)", "", true)}
      </div>
      <p className="text-xs text-ink-faint">New prices apply to future views and clicks. Advertisers see current prices when they create an ad.</p>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button className="btn-primary" disabled={!canEdit} onClick={async () => {
        setMsg(null);
        try { await api("/api/admin/config", { method: "PUT", body: { config: Object.fromEntries(["ads.enabled", "ads.pricing", "ads.frequencyPerCampaignPerDay", "ads.maxPerMemberPerDay", "ads.discoverEvery", "ads.minDailyBudgetMinor", "ads.minTopupMinor"].map((k) => [k, c[k]])) } }); setMsg({ tone: "success", text: "Ad settings saved." }); }
        catch (e: any) { setMsg({ tone: "error", text: e.message }); }
      }}>Save ad settings</button>
      {!canEdit && <p className="text-xs text-ink-faint">Only admins can change prices.</p>}
    </div>
  );
}

export default function Page() {
  return <AdminShell><Ads /></AdminShell>;
}
