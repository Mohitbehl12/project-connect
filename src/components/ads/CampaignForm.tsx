"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, Field, PillPicker, Segmented } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { AdCard, inr } from "./AdCard";
import { useAccount, type Campaign } from "./AdsShell";

type Meta = {
  objectives: Record<string, string>; ctas: Record<string, string>; placements: Record<string, string>; pricingModels: Record<string, string>;
  regions: Record<string, string[]>; cities: string[]; countries: Record<string, string>; genders: Record<string, string>; interests: Record<string, string>;
  prices: { cpmMinor: number; cpcMinor: number; cpaMinor: number; fixedPerDayMinor: number }; minDailyBudgetMinor: number;
};

const STEPS = ["Objective", "Creative", "Audience", "Budget & placement", "Review"];
const toDate = (s: string | null) => (s ? s.slice(0, 10) : "");
const fromDate = (d: string, end = false) => (d ? new Date(`${d}T${end ? "23:59:59" : "00:00:00"}+05:30`).toISOString() : null);

export function CampaignForm({ existing, media = {} }: { existing?: Campaign; media?: Record<string, string> }) {
  const router = useRouter();
  const { reload, account } = useAccount();
  const meta = useApi<Meta>("/api/ads/meta");
  const [step, setStep] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>(media);
  const [f, setF] = useState(() => ({
    name: existing?.name ?? "", objective: existing?.objective ?? "", placements: existing?.placements ?? ["DISCOVER", "FEED"], pricing: existing?.pricing ?? "CPM",
    daily: existing ? String(existing.dailyBudgetMinor / 100) : "500", total: existing?.totalBudgetMinor ? String(existing.totalBudgetMinor / 100) : "10000",
    start: toDate(existing?.startAt ?? null), end: toDate(existing?.endAt ?? null),
    targeting: existing?.targeting ?? { countries: ["IN"], regions: [] as string[], cities: [] as string[], ageMin: 18, ageMax: 99, genders: [] as string[], interests: [] as string[], devices: [] as string[], languages: [] as string[] },
    creative: existing?.creative ?? { headline: "", description: "", cta: "LEARN_MORE", url: "", logoKey: null as string | null, imageKeys: [] as string[], videoKey: null as string | null },
  }));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [reach, setReach] = useState<string>("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const setT = (k: keyof typeof f.targeting, v: unknown) => setF((s) => ({ ...s, targeting: { ...s.targeting, [k]: v } }));
  const setC = (k: keyof typeof f.creative, v: unknown) => setF((s) => ({ ...s, creative: { ...s.creative, [k]: v } }));

  // Live estimate of audience size (rounded on the server; never exact for small groups).
  const tKey = JSON.stringify(f.targeting);
  useEffect(() => {
    const h = setTimeout(() => { api<{ audience: string }>("/api/ads/reach", { body: f.targeting }).then((r) => setReach(r.audience)).catch((e) => setReach(e.message)); }, 400);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tKey]);

  const m = meta.data;
  const preview = useMemo(() => ({
    id: "preview", headline: f.creative.headline, description: f.creative.description, cta: m?.ctas[f.creative.cta] ?? "Learn more",
    advertiser: { name: account.advertiser.businessName, verified: account.advertiser.verification !== "UNVERIFIED" }, logo: f.creative.logoKey ? urls[f.creative.logoKey] ?? null : null,
    images: f.creative.imageKeys.map((k) => urls[k]).filter(Boolean), video: f.creative.videoKey ? urls[f.creative.videoKey] ?? null : null, hasLink: !!f.creative.url,
  }), [f.creative, urls, m, account]);

  async function upload(file: File, kind: "image" | "logo" | "video") {
    setErr(""); setUploading(kind);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("kind", kind);
      const res = await fetch("/api/ads/creatives", { method: "POST", body: fd, credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      setUrls((u) => ({ ...u, [data.key]: data.url }));
      if (kind === "logo") setC("logoKey", data.key);
      else if (kind === "video") setC("videoKey", data.key);
      else setC("imageKeys", [...f.creative.imageKeys, data.key].slice(0, 5));
    } catch (e: any) { setErr(e.message); } finally { setUploading(""); }
  }

  function body() {
    return {
      name: f.name, objective: f.objective, placements: f.placements, pricing: f.pricing,
      dailyBudgetMinor: f.pricing === "FIXED" ? 0 : Math.round(Number(f.daily || 0) * 100), totalBudgetMinor: f.pricing === "FIXED" ? 0 : Math.round(Number(f.total || 0) * 100),
      startAt: fromDate(f.start), endAt: fromDate(f.end, true), targeting: f.targeting, creative: f.creative,
    };
  }
  async function save(submit: boolean) {
    setErr(""); setBusy(true);
    try {
      const r = existing ? await api<{ campaign: Campaign }>(`/api/ads/campaigns/${existing.id}`, { method: "PUT", body: body() }) : await api<{ campaign: Campaign }>("/api/ads/campaigns", { body: body() });
      if (submit) await api(`/api/ads/campaigns/${r.campaign.id}/submit`, { method: "POST" });
      reload();
      router.push(`/ads/${r.campaign.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  if (!m) return <p className="text-ink-soft">Loading…</p>;
  const fixedDays = f.start && f.end ? Math.max(1, Math.ceil((new Date(f.end).getTime() - new Date(f.start).getTime()) / 86400_000) + 1) : 0;
  const canNext = [!!f.objective && f.name.trim().length >= 3, f.creative.headline.trim().length >= 3 && (f.creative.imageKeys.length > 0 || !!f.creative.videoKey), true, f.placements.length > 0, true][step];
  const priceLine = f.pricing === "CPM" ? `${inr(m.prices.cpmMinor)} per 1,000 views` : f.pricing === "CPC" ? `${inr(m.prices.cpcMinor)} per click` : f.pricing === "CPA" ? `${inr(m.prices.cpaMinor)} per action you report` : `${inr(m.prices.fixedPerDayMinor)} per day`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <ol className="mb-6 flex flex-wrap gap-2" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s}><button type="button" onClick={() => i <= step && setStep(i)} aria-current={i === step ? "step" : undefined}
              className={`rounded-pill px-3 py-1.5 text-sm font-semibold ${i === step ? "bg-ink text-paper" : i < step ? "bg-sage-wash text-sage" : "bg-paper-sunk text-ink-faint"}`}>{i + 1}. {s}</button></li>
          ))}
        </ol>

        {step === 0 && (
          <div className="space-y-6">
            <Field label="Campaign name" hint="Only you and our review team see this.">{(id) => <input id={id} className="input" maxLength={80} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Diwali weekend offer" />}</Field>
            <div><p className="label">What do you want to achieve?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(m.objectives).map(([k, v]) => (
                  <button key={k} type="button" aria-pressed={f.objective === k} onClick={() => set("objective", k)}
                    className={`rounded-xl border p-4 text-left font-semibold ${f.objective === k ? "border-berry bg-rose-wash" : "border-mist bg-paper-raised hover:border-ink-faint"}`}>{v}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field label="Headline" hint={`${f.creative.headline.length}/60`}>{(id) => <input id={id} className="input" maxLength={60} value={f.creative.headline} onChange={(e) => setC("headline", e.target.value)} placeholder="Candlelit dinner for two, 20% off" />}</Field>
            <Field label="Description" hint={`${f.creative.description.length}/160`}>{(id) => <textarea id={id} className="input min-h-20" maxLength={160} value={f.creative.description} onChange={(e) => setC("description", e.target.value)} />}</Field>
            <div><p className="label">Button</p><Segmented options={m.ctas} value={f.creative.cta} onChange={(v) => setC("cta", v)} /></div>
            <Field label="Website address" hint={f.objective === "AWARENESS" ? "Optional for brand awareness. Must start with https://" : "Where people go when they tap the button. Must start with https://"}>
              {(id) => <input id={id} type="url" className="input" value={f.creative.url} onChange={(e) => setC("url", e.target.value)} placeholder="https://" />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="panel cursor-pointer p-4 text-sm"><span className="font-semibold">Images</span><span className="block text-ink-faint">Up to 5 · JPEG, PNG, WebP</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "image")} />
                <span className="mt-2 inline-block font-semibold text-berry">{uploading === "image" ? "Uploading…" : `Add image (${f.creative.imageKeys.length}/5)`}</span></label>
              <label className="panel cursor-pointer p-4 text-sm"><span className="font-semibold">Short video</span><span className="block text-ink-faint">MP4 or WebM · up to 20 MB</span>
                <input type="file" accept="video/mp4,video/webm" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "video")} />
                <span className="mt-2 inline-block font-semibold text-berry">{uploading === "video" ? "Uploading…" : f.creative.videoKey ? "Replace video" : "Add video"}</span></label>
              <label className="panel cursor-pointer p-4 text-sm"><span className="font-semibold">Logo</span><span className="block text-ink-faint">Square works best</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "logo")} />
                <span className="mt-2 inline-block font-semibold text-berry">{uploading === "logo" ? "Uploading…" : f.creative.logoKey ? "Replace logo" : "Add logo"}</span></label>
            </div>
            {(f.creative.imageKeys.length > 0 || f.creative.videoKey) && (
              <div className="flex flex-wrap gap-2 text-sm">
                {f.creative.imageKeys.map((k, i) => <button key={k} type="button" className="btn-outline px-3 py-1" onClick={() => setC("imageKeys", f.creative.imageKeys.filter((x) => x !== k))}>Remove image {i + 1}</button>)}
                {f.creative.videoKey && <button type="button" className="btn-outline px-3 py-1" onClick={() => setC("videoKey", null)}>Remove video</button>}
              </div>
            )}
            <p className="text-xs text-ink-faint">Only use images you own or have permission to use. People shown must have agreed. Photos have location data removed.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="rounded-xl bg-paper-sunk p-4"><p className="text-sm text-ink-soft">Estimated audience</p><p className="font-display text-2xl font-extrabold">{reach || "…"}</p><p className="text-xs text-ink-faint">A rough guide, not a promise of reach. Members' exact locations are never used or shared.</p></div>
            <div><p className="label">Countries</p><PillPicker options={m.countries} value={f.targeting.countries} onChange={(v) => setT("countries", v)} /></div>
            <div><p className="label">States / regions</p><PillPicker options={Object.fromEntries(Object.keys(m.regions).map((r) => [r, r]))} value={f.targeting.regions} onChange={(v) => setT("regions", v)} /></div>
            <div><p className="label">Cities</p><PillPicker options={Object.fromEntries(m.cities.map((c) => [c, c]))} value={f.targeting.cities} onChange={(v) => setT("cities", v)} max={40} /></div>
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Age from">{(id) => <input id={id} type="number" min={18} max={99} className="input w-28" value={f.targeting.ageMin} onChange={(e) => setT("ageMin", Math.max(18, Number(e.target.value) || 18))} />}</Field>
              <Field label="to">{(id) => <input id={id} type="number" min={18} max={99} className="input w-28" value={f.targeting.ageMax} onChange={(e) => setT("ageMax", Math.min(99, Number(e.target.value) || 99))} />}</Field>
            </div>
            <div><p className="label">Gender (optional)</p><PillPicker options={m.genders} value={f.targeting.genders} onChange={(v) => setT("genders", v)} />
              <p className="mt-1 text-xs text-ink-faint">Gender and interests only reach members who have personalised ads switched on, so they narrow your audience.</p></div>
            <div><p className="label">Interests, fashion and lifestyle (optional)</p><PillPicker options={m.interests} value={f.targeting.interests} onChange={(v) => setT("interests", v)} max={10} /></div>
            <div><p className="label">Devices</p><PillPicker options={{ ios: "iPhone", android: "Android", web: "Web" }} value={f.targeting.devices} onChange={(v) => setT("devices", v)} /></div>
            <div><p className="label">Language</p><PillPicker options={{ en: "English", hi: "Hindi" }} value={f.targeting.languages} onChange={(v) => setT("languages", v)} /></div>
            <p className="text-xs text-ink-faint">Targeting by religion, caste, health, sexuality, political views, who someone wants to date, or anything from their messages isn't possible.</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div><p className="label">Where should it appear?</p>
              <div className="space-y-2">
                {Object.entries(m.placements).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4" checked={f.placements.includes(k)} onChange={(e) => set("placements", e.target.checked ? [...f.placements, k] : f.placements.filter((x) => x !== k))} />{v}</label>
                ))}
              </div>
            </div>
            <div><p className="label">How do you want to pay?</p><Segmented options={m.pricingModels} value={f.pricing} onChange={(v) => set("pricing", v)} />
              <p className="mt-2 text-sm text-ink-soft">Current price: <strong>{priceLine}</strong>. {f.pricing === "CPA" && "You report actions with the conversion code shown after approval."}</p></div>
            {f.pricing !== "FIXED" && (
              <div className="flex flex-wrap gap-4">
                <Field label="Daily budget (₹)" hint={`At least ₹${m.minDailyBudgetMinor / 100}`}>{(id) => <input id={id} type="number" min={m.minDailyBudgetMinor / 100} className="input w-40" value={f.daily} onChange={(e) => set("daily", e.target.value)} />}</Field>
                <Field label="Total budget (₹)" hint="Leave empty for no limit (your balance still caps spend)">{(id) => <input id={id} type="number" min={0} className="input w-40" value={f.total} onChange={(e) => set("total", e.target.value)} />}</Field>
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              <Field label={f.pricing === "FIXED" ? "Start date" : "Start date (optional)"}>{(id) => <input id={id} type="date" className="input" value={f.start} onChange={(e) => set("start", e.target.value)} />}</Field>
              <Field label={f.pricing === "FIXED" ? "End date" : "End date (optional)"}>{(id) => <input id={id} type="date" className="input" value={f.end} onChange={(e) => set("end", e.target.value)} />}</Field>
            </div>
            {f.pricing === "FIXED" && fixedDays > 0 && <Alert tone="info">Fixed placement for {fixedDays} day{fixedDays === 1 ? "" : "s"}: about {inr(fixedDays * m.prices.fixedPerDayMinor)}, charged from your balance when the ad is approved.</Alert>}
            <p className="text-xs text-ink-faint">We don't guarantee a number of views, clicks or sales. You can pause at any time.</p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <dl className="panel divide-y divide-mist">
              {[
                ["Name", f.name], ["Objective", m.objectives[f.objective] ?? "—"], ["Placements", f.placements.map((p) => m.placements[p]?.split(" — ")[0]).join(", ")],
                ["Pricing", `${m.pricingModels[f.pricing]} · ${priceLine}`], ["Budget", f.pricing === "FIXED" ? `Fixed, ${f.start || "?"} to ${f.end || "?"}` : `₹${f.daily}/day${f.total ? `, ₹${f.total} total` : ""}`],
                ["Audience", reach], ["Website", f.creative.url || "None"],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-4 p-3"><dt className="text-ink-soft">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
            </dl>
            <Alert tone="info">Submitting sends your ad for review. Our team checks the images, text, website, business and targeting — usually within one working day. Ads only run while you have balance.</Alert>
          </div>
        )}

        {err && <div className="mt-4"><Alert tone="error">{err}</Alert></div>}
        <div className="mt-8 flex flex-wrap gap-2">
          {step > 0 && <button type="button" className="btn-outline" onClick={() => setStep(step - 1)}>Back</button>}
          {step < 4 && <button type="button" className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>}
          {step === 4 && <button type="button" className="btn-primary" disabled={busy} onClick={() => save(true)}>{busy ? "Submitting…" : "Submit for review"}</button>}
          {f.name.trim().length >= 3 && f.objective && f.creative.headline.trim().length >= 3 && <button type="button" className="btn-ghost" disabled={busy} onClick={() => save(false)}>Save as draft</button>}
          <Link href="/ads" className="btn-ghost">Cancel</Link>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <p className="label">Live preview</p>
        <AdCard ad={preview} preview />
        <p className="mt-3 text-xs text-ink-faint">Members always see the gold "Sponsored" label and your business name. Ads never appear inside chats or during calls.</p>
        {f.placements.includes("BANNER") && <><p className="label mt-6">As a banner</p><AdCard ad={preview} preview compact /></>}
      </aside>
    </div>
  );
}
