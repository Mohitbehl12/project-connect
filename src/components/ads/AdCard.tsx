"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";

export type AdView = {
  id: string; token?: string; label?: string; headline: string; description: string; cta: string;
  advertiser: { name: string; verified: boolean; trusted?: boolean };
  logo: string | null; images?: string[]; image?: string | null; video?: string | null; hasLink: boolean; why?: string;
};

/**
 * A sponsored card. Deliberately unlike a member profile: a gold "Sponsored" tag, the business name and logo,
 * a landscape image and a call-to-action button — never a first name, age or like button.
 */
export function AdCard({ ad, preview = false, compact = false, onHide, onReport }: { ad: AdView; preview?: boolean; compact?: boolean; onHide?: () => void; onReport?: () => void }) {
  const [menu, setMenu] = useState(false);
  const [why, setWhy] = useState(false);
  const [slide, setSlide] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const images = ad.images ?? (ad.image ? [ad.image] : []);
  useEffect(() => {
    if (preview || !ad.token || !ref.current) return;
    const el = ref.current;
    let sent = false;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio >= 0.5 && !sent) {
        sent = true;
        fetch("/api/ads/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: ad.token, kind: "IMPRESSION" }) }).catch(() => {});
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [ad.token, preview]);
  const href = !preview && ad.token && ad.hasLink ? `/api/ads/click?t=${encodeURIComponent(ad.token)}` : undefined;

  return (
    <div ref={ref} className="relative overflow-hidden rounded-card border border-[#E9C37A]/50 bg-paper-raised shadow-sm" aria-label={`Sponsored: ${ad.advertiser.name}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {ad.logo ? <img src={ad.logo} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <div aria-hidden className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper-sunk font-bold">{ad.advertiser.name.slice(0, 1)}</div>}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{ad.advertiser.name}{ad.advertiser.verified && <span className="ml-1.5 rounded-pill bg-sage-wash px-1.5 py-0.5 text-[11px] font-semibold text-sage" title="We checked who this business is. This is not a guarantee of its products.">{ad.advertiser.trusted ? "Trusted advertiser" : "Verified business"}</span>}</p>
          <p className="text-xs font-bold uppercase tracking-wide text-[#A5781F]">{ad.label ?? "Sponsored"}</p>
        </div>
        {!preview && (
          <div className="relative">
            <button className="btn-ghost px-2 py-1 text-lg" aria-label="Ad options" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button>
            {menu && (
              <div className="absolute right-0 z-10 mt-1 w-56 rounded-xl border border-mist bg-paper-raised p-1 text-sm shadow-lg" role="menu">
                {onHide && <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-paper-sunk" onClick={() => { setMenu(false); onHide(); }}>Hide this ad</button>}
                {onReport && <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-paper-sunk" onClick={() => { setMenu(false); onReport(); }}>Report ad</button>}
                {ad.why && <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-paper-sunk" onClick={() => { setMenu(false); setWhy(true); }}>Why am I seeing this?</button>}
                {onHide && <a role="menuitem" href="/settings" className="block rounded-lg px-3 py-2 hover:bg-paper-sunk">Manage ad preferences</a>}
              </div>
            )}
          </div>
        )}
      </div>
      {why && <p className="mx-4 mb-3 rounded-xl bg-paper-sunk p-3 text-sm text-ink-soft">{ad.why} <button className="font-semibold underline" onClick={() => setWhy(false)}>OK</button></p>}
      {ad.video ? (
        <video src={ad.video} className="aspect-video w-full bg-black object-cover" muted playsInline controls preload="metadata"
          onPlay={() => { if (!preview && ad.token) fetch("/api/ads/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: ad.token, kind: "VIDEO_VIEW" }) }).catch(() => {}); }} />
      ) : images.length ? (
        <div className="relative">
          <img src={images[slide]} alt="" className={`w-full object-cover ${compact ? "aspect-[3/1]" : "aspect-[4/3]"}`} />
          {images.length > 1 && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
              {images.map((_, i) => <button key={i} aria-label={`Image ${i + 1}`} onClick={() => setSlide(i)} className={`h-2 w-2 rounded-full ${i === slide ? "bg-white" : "bg-white/50"}`} />)}
            </div>
          )}
        </div>
      ) : (
        <div className={`flex items-center justify-center bg-paper-sunk text-ink-faint ${compact ? "aspect-[3/1]" : "aspect-[4/3]"}`}>Add an image or video</div>
      )}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold leading-tight">{ad.headline || "Your headline"}</p>
          {ad.description && !compact && <p className="mt-0.5 text-sm text-ink-soft">{ad.description}</p>}
        </div>
        {href ? <a href={href} target="_blank" rel="noopener noreferrer sponsored" className="btn-primary shrink-0 px-4 py-2 text-sm">{ad.cta}</a>
          : <span className="btn-primary shrink-0 px-4 py-2 text-sm">{ad.cta}</span>}
      </div>
    </div>
  );
}

/** A tiny dependency-free line chart for daily numbers. */
export function MiniChart({ data, label, color = "#C2185B", format = (n: number) => String(n) }: { data: { day: string; value: number }[]; label: string; color?: string; format?: (n: number) => string }) {
  const w = 600, h = 160, pad = 24;
  const max = Math.max(1, ...data.map((d) => d.value));
  const x = (i: number) => pad + (data.length <= 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (data.length - 1));
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <figure className="panel p-4">
      <figcaption className="flex items-baseline justify-between"><span className="font-semibold">{label}</span><span className="text-sm text-ink-soft">{format(total)} in {data.length} day{data.length === 1 ? "" : "s"}</span></figcaption>
      {data.length ? (
        <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-40 w-full" role="img" aria-label={`${label} per day`}>
          <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="currentColor" className="text-mist" />
          <path d={`${path} L${x(data.length - 1)},${h - pad} L${x(0)},${h - pad} Z`} fill={color} opacity={0.12} />
          <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
          {data.map((d, i) => <circle key={d.day} cx={x(i)} cy={y(d.value)} r={3} fill={color}><title>{`${d.day}: ${format(d.value)}`}</title></circle>)}
          <text x={pad} y={h - 6} fontSize="11" className="fill-current text-ink-faint">{data[0].day}</text>
          <text x={w - pad} y={h - 6} fontSize="11" textAnchor="end" className="fill-current text-ink-faint">{data[data.length - 1].day}</text>
          <text x={pad} y={14} fontSize="11" className="fill-current text-ink-faint">{format(max)}</text>
        </svg>
      ) : <p className="py-12 text-center text-sm text-ink-faint">No data yet — numbers appear once your ad runs.</p>}
    </figure>
  );
}

export const inr = (minor: number) => { const d = minor % 100 === 0 ? 0 : 2; return `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`; };
