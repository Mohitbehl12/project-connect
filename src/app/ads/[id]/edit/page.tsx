"use client";
import { useParams } from "next/navigation";
import { AdsShell, type Campaign } from "@/components/ads/AdsShell";
import { CampaignForm } from "@/components/ads/CampaignForm";
import { Alert, Spinner } from "@/components/ui";
import { useApi } from "@/lib/client";

function Edit() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<{ campaign: Campaign; media: Record<string, string> }>(`/api/ads/campaigns/${id}`);
  if (q.error) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  return (
    <>
      <h1 className="mb-2 text-3xl font-extrabold">Edit “{q.data.campaign.name}”</h1>
      {["ACTIVE", "APPROVED", "PAUSED", "PENDING_REVIEW"].includes(q.data.campaign.status) && <div className="mb-6"><Alert tone="warn">Changing the ad, audience or placements sends it back for review, and it stops running until it's approved again. Name, budget and dates can change without review.</Alert></div>}
      <CampaignForm existing={q.data.campaign} media={q.data.media} />
    </>
  );
}

export default function Page() {
  return <AdsShell><Edit /></AdsShell>;
}
