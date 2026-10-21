"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ReportAdDialog } from "./ReportAdDialog";
import { AdCard, type AdView } from "./AdCard";

/** A sponsored slot for members (web). Renders nothing when there's no ad, so pages never show empty boxes. */
export function SponsoredSlot({ placement, compact = false, className = "" }: { placement: "BANNER" | "FEED" | "DISCOVER" | "RECOMMENDATION"; compact?: boolean; className?: string }) {
  const [ad, setAd] = useState<AdView | null>(null);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { api<{ ad: AdView | null }>(`/api/ads/serve?placement=${placement}`).then((r) => setAd(r.ad)).catch(() => {}); }, [placement]);
  if (notice) return <p className={`rounded-xl bg-paper-sunk px-4 py-3 text-sm text-ink-soft ${className}`} role="status">{notice}</p>;
  if (!ad) return null;
  return (
    <div className={className}>
      <AdCard ad={ad} compact={compact}
        onHide={async () => { await api(`/api/ads/${ad.id}/hide`, { method: "POST" }).catch(() => {}); setAd(null); setNotice("Ad hidden. You won't see it again."); }}
        onReport={() => setReporting(true)} />
      <ReportAdDialog open={reporting} adId={ad.id} onClose={() => setReporting(false)} onDone={(m) => { setReporting(false); setAd(null); setNotice(m); }} />
    </div>
  );
}
