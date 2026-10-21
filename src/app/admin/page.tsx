"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AdminShell, AdminTitle, useStaff } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { formatMoney, useApi } from "@/lib/client";
import { COUNTRIES } from "@/lib/constants";

type Stats = {
  users: Record<string, number>; engagement: Record<string, number>;
  members?: Record<string, number>; calls?: Record<string, number>; payments30d?: { currency: string; amountMinor: number }[]; safety: { openReports: number; criticalReports: number };
  revenue30d: { currency: string; amountMinor: number }[]; byCountry: { country: string; n: number }[]; byPlan: { plan: string; n: number }[];
  daily: { signups: { d: string; n: number }[]; matches: { d: string; n: number }[] }; retention7d: number;
};

function Kpi({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold">{value}</p>
      {note && <p className="text-xs text-ink-faint">{note}</p>}
    </div>
  );
}

function Bars({ title, rows, color }: { title: string; rows: { d: string; n: number }[]; color: string }) {
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10));
  const map = new Map(rows.map((r) => [r.d, r.n]));
  const max = Math.max(1, ...days.map((d) => map.get(d) ?? 0));
  return (
    <div className="panel p-5">
      <h2 className="font-bold">{title}</h2>
      <div className="mt-4 flex h-32 items-end gap-1" role="img" aria-label={`${title}: ${days.map((d) => `${d} ${map.get(d) ?? 0}`).join(", ")}`}>
        {days.map((d) => {
          const n = map.get(d) ?? 0;
          return (
            <div key={d} className="group relative flex-1">
              <div className={`w-full rounded-t ${color}`} style={{ height: `${Math.max(2, (n / max) * 120)}px` }} />
              <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-ink px-1.5 text-xs text-paper group-hover:block">{n}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink-faint"><span>{days[0].slice(5)}</span><span>today</span></div>
    </div>
  );
}

function Dashboard() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staff.permissions.includes("analytics.view");
  useEffect(() => { if (!allowed) router.replace(staff.permissions.includes("payments.view") ? "/admin/payments" : staff.permissions.includes("security.view") ? "/admin/risk" : "/admin/reports"); }, [allowed, router, staff.permissions]);
  const { data, error } = useApi<Stats>(allowed ? "/api/admin/stats" : null);
  if (!allowed) return null;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (!data) return <Spinner />;
  const u = data.users;
  return (
    <>
      <AdminTitle title="Dashboard" />
      {data.safety.criticalReports > 0 && (
        <div className="mb-6"><Alert tone="error"><strong>{data.safety.criticalReports} critical report{data.safety.criticalReports > 1 ? "s" : ""}</strong> waiting (safety or possible minor). <Link href="/admin/reports" className="font-semibold underline">Review now</Link></Alert></div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total members" value={u.total} note={`${u.new7d} joined this week`} />
        <Kpi label="Active today" value={u.active24h} note={`${u.active7d} this week · ${data.retention7d}% weekly active`} />
        <Kpi label="Verified" value={u.verified} note={`${u.pendingVerification} waiting for review`} />
        <Kpi label="Premium members" value={u.premium} />
        <Kpi label="Matches" value={data.engagement.matches} note={`${data.engagement.matches7d} this week`} />
        <Kpi label="Messages this week" value={data.engagement.messages7d} />
        <Kpi label="Open reports" value={data.safety.openReports} note={`${data.engagement.blocks} blocks in total`} />
        <Kpi label="Suspended / banned" value={`${u.suspended} / ${u.banned}`} />
      </div>
      {data.members && (
        <>
          <h2 className="mb-2 mt-6 text-lg font-bold">Memberships</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Men / women" value={`${data.members.men} / ${data.members.women}`} />
            <Kpi label="Free trials (men)" value={data.members.freeTrials} />
            <Kpi label="Free forever (women)" value={data.members.freeForever} />
            <Kpi label="Paid memberships" value={data.members.paidMemberships} note={`${data.members.subs100} on ₹100/month · ${data.members.payPending} payment pending`} />
            <Kpi label="Revenue, last 30 days" value={(data.payments30d ?? []).map((r) => `${r.currency === "INR" ? "₹" : r.currency + " "}${(r.amountMinor / 100).toLocaleString("en-IN")}`).join(" · ") || "₹0"} note="Payments received" />
          </div>
          <h2 className="mb-2 mt-6 text-lg font-bold">Calls</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Call requests" value={data.calls?.requests ?? 0} />
            <Kpi label="Accepted / declined" value={`${data.calls?.accepted ?? 0} / ${data.calls?.declined ?? 0}`} />
            <Kpi label="Calls completed" value={data.calls?.completed ?? 0} note={`${data.calls?.missed ?? 0} missed`} />
            <Kpi label="Blocks" value={data.engagement.blocks} note={`${u.suspended} suspended · ${u.banned} banned`} />
          </div>
        </>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Bars title="Sign-ups, last 14 days" rows={data.daily.signups} color="bg-ink" />
        <Bars title="Matches, last 14 days" rows={data.daily.matches} color="bg-marigold" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="panel p-5">
          <h2 className="font-bold">Revenue, last 30 days</h2>
          {data.revenue30d.length ? data.revenue30d.map((r) => <p key={r.currency} className="mt-2 font-display text-2xl font-extrabold">{formatMoney(r.amountMinor, r.currency)}</p>) : <p className="mt-2 text-ink-soft">No payments yet.</p>}
          <p className="mt-2 text-xs text-ink-faint">Includes mock test checkouts.</p>
        </div>
        <div className="panel p-5">
          <h2 className="font-bold">Members by country</h2>
          <ul className="mt-3 space-y-1.5">{data.byCountry.map((c) => <li key={c.country} className="flex justify-between"><span>{COUNTRIES[c.country]?.name ?? c.country}</span><span className="font-semibold">{c.n}</span></li>)}</ul>
        </div>
        <div className="panel p-5">
          <h2 className="font-bold">Members by plan</h2>
          <ul className="mt-3 space-y-1.5">{data.byPlan.map((p) => <li key={p.plan} className="flex justify-between"><span>{p.plan.replace("_", " ")}</span><span className="font-semibold">{p.n}</span></li>)}</ul>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <AdminShell><Dashboard /></AdminShell>;
}
