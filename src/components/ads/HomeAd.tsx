"use client";
import { useEffect, useState } from "react";
import { AdCard, type AdView } from "./AdCard";

/** Homepage banner for visitors. Only ads with no personal targeting are eligible; nothing about the visitor is used. */
export function HomeAd() {
  const [ad, setAd] = useState<AdView | null>(null);
  useEffect(() => { fetch("/api/ads/home").then((r) => r.json()).then((d) => setAd(d.ad ? { ...d.ad, why: "This ad is shown to everyone who visits Kinara. Nothing about you is used to choose it, and the advertiser doesn't learn who you are." } : null)).catch(() => {}); }, []);
  if (!ad) return null;
  return (
    <section aria-label="Sponsored" className="mx-auto max-w-3xl px-4 pt-12 md:px-8">
      <AdCard ad={ad} compact />
    </section>
  );
}
