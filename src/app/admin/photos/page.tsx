"use client";
import { useState } from "react";
import { AdminShell, AdminTitle } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";

type P = { id: string; userId: string; name: string; url: string; width: number; height: number };

function PhotoReview() {
  const q = useApi<{ photos: P[] }>("/api/admin/photos");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  async function decide(p: P, approve: boolean) {
    try { await api(`/api/admin/photos/${p.id}`, { body: { approve } }); setMsg({ tone: "success", text: approve ? "Approved." : "Removed — the person has been told." }); q.reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  return (
    <>
      <AdminTitle title="Photo review" sub="New photos wait here until checked. Approve photos that show the person clearly and follow the Community Guidelines. Swimwear is fine; explicit content, other people's photos, children and violence are not." />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {q.error && <Alert tone="error">{q.error.message}</Alert>}
      {!q.data && !q.error && <Spinner />}
      {q.data && !q.data.photos.length && <p className="text-ink-soft">No photos waiting. Nice.</p>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {q.data?.photos.map((p) => (
          <div key={p.id} className="panel overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={`Photo from ${p.name || "a member"}`} className="aspect-[3/4] w-full object-cover" />
            <div className="p-3">
              <p className="text-sm font-semibold">{p.name || "Member"}</p>
              <div className="mt-2 flex gap-2">
                <button className="btn-primary flex-1 px-2 py-1.5 text-sm" onClick={() => decide(p, true)}>Approve</button>
                <button className="btn-outline flex-1 px-2 py-1.5 text-sm" onClick={() => decide(p, false)}>Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return <AdminShell><PhotoReview /></AdminShell>;
}
