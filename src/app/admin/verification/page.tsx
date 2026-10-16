"use client";
import Link from "next/link";
import { useState } from "react";
import { AdminShell, AdminTitle } from "@/components/AdminShell";
import { Alert, Empty, Spinner } from "@/components/ui";
import { api, timeAgo, useApi } from "@/lib/client";

type Item = {
  attemptId: string; userId: string; name: string; city: string; age: number | null; pose: { key: string; text: string; emoji: string };
  selfieUrl: string | null; submittedAt: string; faceCount: number | null; profileFaces: number | null; distance: number | null;
  match: "STRONG" | "POSSIBLE" | "UNLIKELY" | "NO_PROFILE_FACE" | "UNCHECKED"; photos: string[];
};
const MATCH: Record<Item["match"], [string, string]> = {
  STRONG: ["Strong match with profile photos", "bg-sage-wash text-sage"],
  POSSIBLE: ["Possible match — look closely", "bg-marigold-wash text-ink"],
  UNLIKELY: ["Unlikely to be the same person", "bg-rose-wash text-rose"],
  NO_PROFILE_FACE: ["No face found in the profile photos to compare", "bg-paper-sunk text-ink-soft"],
  UNCHECKED: ["Automatic check didn't run — compare by eye", "bg-paper-sunk text-ink-soft"],
};

function Verification() {
  const { data, loading, error, reload } = useApi<{ queue: Item[] }>("/api/admin/verification");
  const [err, setErr] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  async function decide(it: Item, approve: boolean) {
    setErr("");
    const r = approve ? "Selfie matches the profile photos and the requested pose" : (reason[it.attemptId] ?? "").trim();
    if (!approve && r.length < 3) { setErr("Write the reason the member will see before rejecting."); return; }
    try { await api(`/api/admin/users/${it.userId}`, { body: { action: approve ? "VERIFY" : "REJECT_VERIFICATION", reason: r } }); reload(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <>
      <AdminTitle title="Verification queue" sub="Approve when the selfie shows the same person as the profile photos AND they are doing the requested pose (that shows it's a live photo, not an old one). The automatic match is a guide, not a decision. Selfies are deleted once you decide." />
      {err && <div className="mb-4"><Alert tone="error">{err}</Alert></div>}
      {loading && <Spinner />}
      {error && <Alert tone="error">{error.message}</Alert>}
      {data && !data.queue.length && <Empty title="Nothing to review" body="New selfies will appear here." />}
      <div className="space-y-4">
        {data?.queue.map((it) => (
          <div key={it.attemptId} className="panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/admin/users/${it.userId}`} className="text-lg font-bold hover:underline">{it.name}{it.age ? `, ${it.age}` : ""}</Link>
              <span className="text-sm text-ink-soft">{it.city} · sent {timeAgo(it.submittedAt)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <span className="rounded-pill bg-paper-sunk px-3 py-1">Asked to: <strong>{it.pose.emoji} {it.pose.text}</strong></span>
              <span className={`rounded-pill px-3 py-1 font-semibold ${MATCH[it.match][1]}`}>{MATCH[it.match][0]}{it.distance !== null && it.match !== "NO_PROFILE_FACE" ? ` (${it.distance.toFixed(2)})` : ""}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {/* eslint-disable @next/next/no-img-element */}
              {it.selfieUrl && <figure><img src={it.selfieUrl} alt="Selfie" className="h-56 w-44 rounded-xl object-cover ring-2 ring-berry" /><figcaption className="mt-1 text-center text-xs font-semibold">Selfie</figcaption></figure>}
              {it.photos.map((u, i) => <figure key={u}><img src={u} alt={`Profile photo ${i + 1}`} className="h-56 w-44 rounded-xl object-cover" /><figcaption className="mt-1 text-center text-xs text-ink-faint">Profile {i + 1}</figcaption></figure>)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="btn-primary px-4 py-2 text-sm" onClick={() => decide(it, true)}>Approve</button>
              <input aria-label={`Reason for rejecting ${it.name}`} className="input max-w-md flex-1 py-2 text-sm" placeholder="Reason if rejecting (the member sees this)" value={reason[it.attemptId] ?? ""} onChange={(e) => setReason({ ...reason, [it.attemptId]: e.target.value })} />
              <button className="btn-outline px-4 py-2 text-sm" onClick={() => decide(it, false)}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return <AdminShell><Verification /></AdminShell>;
}
