"use client";
import { AdsShell } from "@/components/ads/AdsShell";
import { CampaignForm } from "@/components/ads/CampaignForm";

export default function Page() {
  return <AdsShell><h1 className="mb-6 text-3xl font-extrabold">Create Advertisement</h1><CampaignForm /></AdsShell>;
}
