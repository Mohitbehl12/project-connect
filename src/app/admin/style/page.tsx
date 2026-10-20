"use client";
import Link from "next/link";
import { useState } from "react";
import { AdminShell, AdminTitle, useStaff } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { api, timeAgo, useApi } from "@/lib/client";

const inr = (minor: number) => `₹${Math.round(minor / 100).toLocaleString("en-IN")}`;
type Order = {
  id: string; garment: string; description: string; profileName: string; priceMinor: number; status: number; statusLabel: string; statuses: string[];
  paymentStatus: string; fitLocked: boolean; notes: string; eta: string | null; createdAt: string; feedback: { fit: string; rating: number; note: string } | null;
  customer: { id: string; name: string }; measurements?: Record<string, { v: number; c: string }>; finished?: [string, number][]; address?: string;
};
const TABS = [["orders", "Orders"], ["customers", "Customers"], ["designs", "AI designs"], ["measurements", "Measurements"], ["fabrics", "Fabrics"], ["reports", "Reports"]] as const;

function Orders() {
  const staff = useStaff();
  const [filter, setFilter] = useState<"open" | "late" | "all">("open");
  const { data, loading, error, reload } = useApi<{ orders: Order[] }>(`/api/admin/style/orders?filter=${filter}`);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const canManage = staff.permissions.includes("style.manage");
  async function setStatus(o: Order, status: number) {
    setErr("");
    try { await api(`/api/admin/style/orders/${o.id}`, { method: "PATCH", body: { status, note: "" } }); reload(); } catch (e: any) { setErr(e.message); }
  }
  return (
    <>
      <div className="mb-3 flex gap-2">{(["open", "late", "all"] as const).map((f) => <button key={f} className={filter === f ? "btn-primary px-3 py-1.5 text-sm" : "btn-outline px-3 py-1.5 text-sm"} onClick={() => setFilter(f)}>{f === "open" ? "In progress" : f === "late" ? "Late" : "All"}</button>)}</div>
      {err && <div className="mb-3"><Alert tone="error">{err}</Alert></div>}
      {loading && <Spinner />}{error && <Alert tone="error">{error.message}</Alert>}
      {data && !data.orders.length && <p className="text-ink-soft">No orders here.</p>}
      <div className="space-y-3">
        {data?.orders.map((o) => (
          <div key={o.id} className="panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <button className="text-left" onClick={() => setOpen(open === o.id ? null : o.id)}>
                <span className="font-bold">{o.id}</span> · {o.garment} for {o.profileName} · <Link href={`/admin/users/${o.customer.id}`} className="underline">{o.customer.name}</Link>
              </button>
              <span className="text-sm text-ink-soft">{inr(o.priceMinor)} · {o.paymentStatus === "TEST_PAID" ? "test payment" : o.paymentStatus.toLowerCase()} · {timeAgo(o.createdAt)}{o.eta ? ` · due ${new Date(o.eta).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{o.description}{o.fitLocked ? " · Fit Locked (free alteration or remake)" : ""}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {o.statuses.map((label, i) => (
                <button key={label} disabled={!canManage || o.paymentStatus === "PENDING"} onClick={() => setStatus(o, i)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${i === o.status ? "bg-ink text-paper" : i < o.status ? "bg-sage-wash text-sage" : "bg-paper-sunk text-ink-soft"}`}>{label}</button>
              ))}
            </div>
            {open === o.id && (
              <div className="mt-3 grid gap-3 border-t border-mist pt-3 text-sm md:grid-cols-2">
                <div>
                  {o.notes && <p className="mb-2"><span className="font-semibold">Instructions:</span> {o.notes}</p>}
                  {o.address && <p className="mb-2 whitespace-pre-line"><span className="font-semibold">Deliver to:</span> {o.address}</p>}
                  {o.feedback && <p><span className="font-semibold">Fit feedback:</span> {o.feedback.fit.toLowerCase()} · {o.feedback.rating}/5 {o.feedback.note && `· “${o.feedback.note}”`}</p>}
                  {o.finished && <><p className="mt-2 font-semibold">Finished garment (in)</p><ul>{o.finished.map(([l, v]) => <li key={l}>{l}: {v.toFixed(1)}</li>)}</ul></>}
                </div>
                {o.measurements ? (
                  <div><p className="font-semibold">Body measurements (in)</p>
                    <ul className="grid grid-cols-2 gap-x-4">{Object.entries(o.measurements).map(([k, x]) => <li key={k}>{k}: {x.v}{x.c === "Low" ? " *check" : ""}</li>)}</ul></div>
                ) : <p className="text-ink-faint">Measurements are only shown to the workshop.</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function Simple<T>({ url, render }: { url: string; render: (d: T) => React.ReactNode }) {
  const { data, loading, error } = useApi<T>(url);
  if (loading) return <Spinner />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  return <>{data && render(data)}</>;
}

function Fabrics() {
  const staff = useStaff();
  const { data, reload } = useApi<{ fabrics: { id: string; name: string; color: string; stockM: number; reorderM: number; costPerM: number }[] }>("/api/admin/style/fabrics");
  const [f, setF] = useState({ name: "", color: "", stockM: 0, reorderM: 10, costPerM: 0 });
  const [err, setErr] = useState("");
  const can = staff.permissions.includes("style.manage");
  const save = async (id: string, body: unknown) => { setErr(""); try { await api(`/api/admin/style/fabrics/${id}`, { method: "PUT", body }); reload(); } catch (e: any) { setErr(e.message); } };
  return (
    <div className="panel overflow-x-auto">
      {err && <div className="p-3"><Alert tone="error">{err}</Alert></div>}
      <table className="w-full text-sm"><thead><tr className="text-left text-ink-faint"><th className="p-3">Fabric</th><th className="p-3">Colour</th><th className="p-3">Stock (m)</th><th className="p-3">Reorder at</th><th className="p-3">Cost/m</th><th className="p-3"></th></tr></thead>
        <tbody>
          {data?.fabrics.map((x) => (
            <tr key={x.id} className={`border-t border-mist ${x.stockM <= x.reorderM ? "bg-marigold/10" : ""}`}>
              <td className="p-3">{x.name}</td><td className="p-3">{x.color}</td>
              <td className="p-3"><input aria-label={`Stock of ${x.name} ${x.color}`} type="number" className="input w-24 py-1" defaultValue={x.stockM} disabled={!can} onBlur={(e) => Number(e.target.value) !== x.stockM && save(x.id, { ...x, stockM: Number(e.target.value) })} /></td>
              <td className="p-3">{x.reorderM}</td><td className="p-3">₹{x.costPerM}</td>
              <td className="p-3">{x.stockM <= x.reorderM ? <span className="font-semibold text-rose">Reorder</span> : ""}</td>
            </tr>
          ))}
          {can && (
            <tr className="border-t border-mist">
              <td className="p-2"><input aria-label="New fabric name" className="input py-1" placeholder="Fabric" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></td>
              <td className="p-2"><input aria-label="Colour" className="input py-1" placeholder="Colour" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></td>
              <td className="p-2"><input aria-label="Stock" type="number" className="input w-24 py-1" value={f.stockM} onChange={(e) => setF({ ...f, stockM: Number(e.target.value) })} /></td>
              <td className="p-2"><input aria-label="Reorder at" type="number" className="input w-20 py-1" value={f.reorderM} onChange={(e) => setF({ ...f, reorderM: Number(e.target.value) })} /></td>
              <td className="p-2"><input aria-label="Cost per metre" type="number" className="input w-24 py-1" value={f.costPerM} onChange={(e) => setF({ ...f, costPerM: Number(e.target.value) })} /></td>
              <td className="p-2"><button className="btn-primary px-3 py-1.5 text-sm" onClick={async () => { setErr(""); try { await api("/api/admin/style/fabrics", { body: f }); setF({ name: "", color: "", stockM: 0, reorderM: 10, costPerM: 0 }); reload(); } catch (e: any) { setErr(e.message); } }}>Add</button></td>
            </tr>
          )}
        </tbody></table>
    </div>
  );
}

function Workshop() {
  const staff = useStaff();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("orders");
  const tabs = TABS.filter(([k]) => k !== "measurements" || staff.permissions.includes("style.measurements"));
  return (
    <>
      <AdminTitle title="Style workshop" sub="Kinara Style clothing orders: design → measurements → payment → production → delivery. Body measurements are personal and only visible to the workshop; every view is logged." />
      <div className="mb-4 flex flex-wrap gap-2">{tabs.map(([k, l]) => <button key={k} className={tab === k ? "btn-primary px-4 py-2 text-sm" : "btn-outline px-4 py-2 text-sm"} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "orders" && <Orders />}
      {tab === "customers" && <Simple<{ customers: { id: string; name: string; city: string; orders: number; spentMinor: number; profiles: number }[] }> url="/api/admin/style/customers" render={(d) => (
        <div className="panel overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-ink-faint"><th className="p-3">Customer</th><th className="p-3">City</th><th className="p-3">Orders</th><th className="p-3">Spent</th><th className="p-3">Measurement profiles</th></tr></thead>
          <tbody>{d.customers.map((c) => <tr key={c.id} className="border-t border-mist"><td className="p-3"><Link href={`/admin/users/${c.id}`} className="font-semibold hover:underline">{c.name}</Link></td><td className="p-3">{c.city}</td><td className="p-3">{c.orders}</td><td className="p-3">{inr(c.spentMinor)}</td><td className="p-3">{c.profiles}</td></tr>)}
            {!d.customers.length && <tr><td className="p-3 text-ink-soft" colSpan={5}>No paying customers yet.</td></tr>}</tbody></table></div>)} />}
      {tab === "designs" && <Simple<{ designs: { id: string; name: string; description: string; price: number; prompt: string | null; by: string; createdAt: string }[] }> url="/api/admin/style/designs" render={(d) => (
        <div className="space-y-2">{d.designs.map((x) => <div key={x.id} className="panel p-3 text-sm"><p className="font-semibold">{x.name} · ₹{x.price.toLocaleString("en-IN")} <span className="font-normal text-ink-faint">by {x.by} · {timeAgo(x.createdAt)}</span></p><p className="text-ink-soft">{x.description}</p>{x.prompt && <p className="text-ink-faint">“{x.prompt}”</p>}</div>)}
          {!d.designs.length && <p className="text-ink-soft">No saved designs yet.</p>}</div>)} />}
      {tab === "measurements" && <Simple<{ profiles: { id: string; name: string; rel: string; owner: string; fitScore: number; method: string | null; m: Record<string, { v: number }> | null; updatedAt: string }[] }> url="/api/admin/style/measurements" render={(d) => (
        <div className="panel overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-ink-faint"><th className="p-3">Profile</th><th className="p-3">Member</th><th className="p-3">How</th><th className="p-3">Fit Lock</th><th className="p-3">Chest · Waist · Height</th><th className="p-3">Updated</th></tr></thead>
          <tbody>{d.profiles.map((p) => <tr key={p.id} className="border-t border-mist"><td className="p-3">{p.name} ({p.rel})</td><td className="p-3">{p.owner}</td><td className="p-3">{p.method ?? "—"}</td><td className="p-3">{p.fitScore}%</td><td className="p-3">{p.m ? `${p.m.chest?.v} · ${p.m.waist?.v} · ${p.m.height?.v} in` : "Not measured"}</td><td className="p-3">{timeAgo(p.updatedAt)}</td></tr>)}</tbody></table></div>)} />}
      {tab === "fabrics" && <Fabrics />}
      {tab === "reports" && <Simple<{ byStatus: { label: string; n: number }[]; paidOrders: number; revenueMinor: number; testOrders: number; unpaid: number; late: number; categories: { category: string; n: number }[] }> url="/api/admin/style/reports" render={(d) => (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="panel p-4"><p className="font-semibold">Orders</p><p className="mt-1 text-sm">{d.paidOrders} paid ({inr(d.revenueMinor)}) · {d.testOrders} test · {d.unpaid} waiting for payment · <span className={d.late ? "font-semibold text-rose" : ""}>{d.late} late</span></p>
            <ul className="mt-2 text-sm">{d.byStatus.map((s) => <li key={s.label}>{s.label}: {s.n}</li>)}</ul></div>
          <div className="panel p-4"><p className="font-semibold">By garment</p><ul className="mt-2 text-sm">{d.categories.map((c) => <li key={c.category}>{c.category}: {c.n}</li>)}{!d.categories.length && <li className="text-ink-soft">No orders yet.</li>}</ul></div>
        </div>)} />}
    </>
  );
}

export default function Page() { return <AdminShell><Workshop /></AdminShell>; }
