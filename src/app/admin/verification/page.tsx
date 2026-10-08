"use client";
import Link from "next/link";
import { useState } from "react";
import { AdminShell, AdminTitle } from "@/components/AdminShell";
import { Alert, Avatar, Empty, Spinner } from "@/components/ui";
import { api, timeAgo, useApi } from "@/lib/client";

function Verification() {
  const { data, loading, error, reload } = useApi<{ users: any[] }>("/api/admin/users?verification=PENDING");
  const [err, setErr] = useState("");
  async function decide(id: string, action: "VERIFY" | "REJECT_VERIFICATION") {
    setErr("");
    const reason = action === "VERIFY" ? "Selfie matches profile" : prompt("Tell the member why (they'll see this):") ?? "";
    if (action === "REJECT_VERIFICATION" && reason.trim().length < 3) return;
    try { await api(`/api/admin/users/${id}`, { body: { action, reason } }); reload(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <>
      <AdminTitle title="Verification queue" sub="Selfie checks waiting for review." />
      <div className="mb-4"><Alert tone="info">Test build: selfie capture and liveness are mocked, so there's no image to compare yet. Production plugs in a liveness provider and shows its result here.</Alert></div>
      {err && <Alert tone="error">{err}</Alert>}
      {loading && <Spinner />}
      {error && <Alert tone="error">{error.message}</Alert>}
      {data && !data.users.length && <Empty title="Nothing to review" body="New verification requests will appear here." />}
      <ul className="space-y-2">
        {data?.users.map((u) => (
          <li key={u.id} className="panel flex flex-wrap items-center gap-4 p-4">
            <Avatar id={u.id} name={u.name ?? "?"} size={44} />
            <div className="flex-1">
              <Link href={`/admin/users/${u.id}`} className="font-semibold hover:underline">{u.name}, {u.age}</Link>
              <p className="text-sm text-ink-soft">{u.city} · joined {timeAgo(u.createdAt)}</p>
            </div>
            <button className="btn-primary px-4 py-2 text-sm" onClick={() => decide(u.id, "VERIFY")}>Approve</button>
            <button className="btn-outline px-4 py-2 text-sm" onClick={() => decide(u.id, "REJECT_VERIFICATION")}>Reject</button>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Page() {
  return <AdminShell><Verification /></AdminShell>;
}
