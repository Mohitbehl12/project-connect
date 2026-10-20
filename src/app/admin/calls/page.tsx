"use client";
import Link from "next/link";
import { useState } from "react";
import { AdminShell, AdminTitle } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { timeAgo, useApi } from "@/lib/client";

type P = { id: string; name: string };
type Data = {
  requests: { id: string; from: P; to: P; kind: string; state: string; createdAt: string; respondedAt: string | null }[];
  calls: { id: string; caller: P; callee: P; kind: string; state: string; endReason: string | null; createdAt: string; durationSec: number | null }[];
};
const STATE: Record<string, string> = { PENDING: "Pending", ACCEPTED: "Accepted", DECLINED: "Declined", CANCELLED: "Cancelled", EXPIRED: "Expired" };
const OUTCOME = (c: Data["calls"][number]) => c.state !== "ENDED" ? "In progress" : c.durationSec !== null ? "Completed" : ({ MISSED: "Missed", DECLINED: "Declined", CANCELLED: "Cancelled", FAILED: "Dropped", BLOCKED: "Ended by block" }[c.endReason ?? ""] ?? "Ended");
const who = (p: P) => <Link href={`/admin/users/${p.id}`} className="font-semibold hover:underline">{p.name}</Link>;
const len = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

function Calls() {
  const { data, loading, error } = useApi<Data>("/api/admin/calls");
  const [tab, setTab] = useState<"requests" | "calls">("requests");
  return (
    <>
      <AdminTitle title="Calls" sub="Call requests and calls between members. Calls need the other person to accept a request first. Only who, when and how long is kept — never audio or video." />
      <div className="mb-4 flex gap-2">
        {(["requests", "calls"] as const).map((t) => <button key={t} className={tab === t ? "btn-primary px-4 py-2 text-sm" : "btn-outline px-4 py-2 text-sm"} onClick={() => setTab(t)}>{t === "requests" ? "Call requests" : "Calls"}</button>)}
      </div>
      {loading && <Spinner />}
      {error && <Alert tone="error">{error.message}</Alert>}
      {data && tab === "requests" && (
        <div className="panel overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-ink-faint"><th className="p-3">From</th><th className="p-3">To</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Sent</th></tr></thead>
          <tbody>{data.requests.map((r) => <tr key={r.id} className="border-t border-mist"><td className="p-3">{who(r.from)}</td><td className="p-3">{who(r.to)}</td><td className="p-3">{r.kind === "VIDEO" ? "Video" : "Voice"}</td><td className="p-3">{STATE[r.state] ?? r.state}</td><td className="p-3">{timeAgo(r.createdAt)}</td></tr>)}
            {!data.requests.length && <tr><td className="p-3 text-ink-soft" colSpan={5}>No call requests yet.</td></tr>}</tbody></table></div>
      )}
      {data && tab === "calls" && (
        <div className="panel overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-ink-faint"><th className="p-3">Caller</th><th className="p-3">Called</th><th className="p-3">Type</th><th className="p-3">Outcome</th><th className="p-3">Length</th><th className="p-3">When</th></tr></thead>
          <tbody>{data.calls.map((c) => <tr key={c.id} className="border-t border-mist"><td className="p-3">{who(c.caller)}</td><td className="p-3">{who(c.callee)}</td><td className="p-3">{c.kind === "VIDEO" ? "Video" : "Voice"}</td><td className="p-3">{OUTCOME(c)}</td><td className="p-3">{len(c.durationSec)}</td><td className="p-3">{timeAgo(c.createdAt)}</td></tr>)}
            {!data.calls.length && <tr><td className="p-3 text-ink-soft" colSpan={6}>No calls yet.</td></tr>}</tbody></table></div>
      )}
    </>
  );
}

export default function Page() { return <AdminShell><Calls /></AdminShell>; }
