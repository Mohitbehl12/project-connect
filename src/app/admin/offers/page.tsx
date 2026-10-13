"use client";
import { useState } from "react";
import { AdminShell, AdminTitle } from "@/components/AdminShell";
import { Alert, Modal, Spinner } from "@/components/ui";
import { api, formatMoney, useApi } from "@/lib/client";

type Offer = { id: string; name: string; kind: string; headline: string; badge: string | null; planCode: string; country: string; genders: string; audience: string; priceMinor: number | null; days: number | null; discountPct: number | null; oncePerUser: boolean; priority: number; startsAt: string | null; endsAt: string | null; active: boolean };
type Coupon = { id: string; code: string; kind: string; value: number; currency: string | null; maxDiscountMinor: number | null; minPurchaseMinor: number | null; audience: string; countries: string; plans: string; genders: string; usageLimit: number | null; perUserLimit: number; usedCount: number; startsAt: string | null; endsAt: string | null; active: boolean };

const KIND = { INTRO: "Intro price (e.g. ₹1 for 15 days, then normal price)", DISCOUNT: "% off the first payment (flash, festival, welcome back)", PASS: "One-off pass that never renews (e.g. weekend pass)" };
const dt = (s: string | null) => (s ? s.slice(0, 16) : "");
const blankOffer = { name: "", kind: "INTRO", headline: "", badge: "", planCode: "PREMIUM", country: "IN", genders: [] as string[], audience: "NEW", price: "1", days: "15", discountPct: "", oncePerUser: true, priority: "10", startsAt: "", endsAt: "", active: true };
const blankCoupon = { code: "", kind: "PERCENT", value: "", currency: "INR", maxDiscount: "", minPurchase: "", audience: "ALL", countries: "", plans: [] as string[], genders: [] as string[], usageLimit: "", perUserLimit: "1", startsAt: "", endsAt: "", active: true };

function describe(o: Offer) {
  const who = [o.country, o.genders ? `${o.genders.toLowerCase()} only` : "everyone", o.audience === "NEW" ? "first-time subscribers" : o.audience === "RETURNING" ? "past subscribers" : null].filter(Boolean).join(" · ");
  const what = o.kind === "INTRO" ? `${formatMoney(o.priceMinor ?? 0, "INR")} for ${o.days} days, then the normal price` : o.kind === "PASS" ? `${formatMoney(o.priceMinor ?? 0, "INR")} once for ${o.days} days` : `${o.discountPct}% off the first payment`;
  return `${what} · ${who}`;
}

function Offers() {
  const offers = useApi<{ offers: Offer[] }>("/api/admin/billing/offers");
  const coupons = useApi<{ coupons: Coupon[] }>("/api/admin/billing/coupons");
  const [editOffer, setEditOffer] = useState<(typeof blankOffer & { id?: string }) | null>(null);
  const [editCoupon, setEditCoupon] = useState<(typeof blankCoupon & { id?: string }) | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (offers.error) return <Alert tone="error">{offers.error.message}</Alert>;
  if (!offers.data || !coupons.data) return <Spinner />;

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function saveOffer() {
    if (!editOffer) return;
    const e = editOffer;
    const body = {
      name: e.name, kind: e.kind, headline: e.headline, badge: e.badge || null, planCode: e.planCode, country: e.country.toUpperCase(), genders: e.genders, audience: e.audience,
      priceMinor: e.kind !== "DISCOUNT" ? Math.round(Number(e.price) * 100) : null, days: e.kind !== "DISCOUNT" ? Number(e.days) : null,
      discountPct: e.kind === "DISCOUNT" ? Number(e.discountPct) : null, oncePerUser: e.oncePerUser, priority: Number(e.priority),
      startsAt: e.startsAt ? new Date(e.startsAt).toISOString() : null, endsAt: e.endsAt ? new Date(e.endsAt).toISOString() : null, active: e.active,
    };
    try {
      await api(e.id ? `/api/admin/billing/offers/${e.id}` : "/api/admin/billing/offers", { method: e.id ? "PUT" : "POST", body });
      setMsg({ tone: "success", text: `Offer “${e.name}” saved.` }); setEditOffer(null); offers.reload();
    } catch (err: any) { setMsg({ tone: "error", text: err.message }); }
  }
  async function saveCoupon() {
    if (!editCoupon) return;
    const c = editCoupon;
    const minor = (v: string) => (v ? Math.round(Number(v) * 100) : null);
    const body = {
      code: c.code, kind: c.kind, value: c.kind === "PERCENT" ? Number(c.value) : Math.round(Number(c.value) * 100), currency: c.kind === "FIXED" ? c.currency : null,
      maxDiscountMinor: minor(c.maxDiscount), minPurchaseMinor: minor(c.minPurchase), audience: c.audience, countries: c.countries.toUpperCase().split(/[ ,]+/).filter(Boolean),
      plans: c.plans, genders: c.genders, usageLimit: c.usageLimit ? Number(c.usageLimit) : null, perUserLimit: Number(c.perUserLimit),
      startsAt: c.startsAt ? new Date(c.startsAt).toISOString() : null, endsAt: c.endsAt ? new Date(c.endsAt).toISOString() : null, active: c.active,
    };
    try {
      await api(c.id ? `/api/admin/billing/coupons/${c.id}` : "/api/admin/billing/coupons", { method: c.id ? "PUT" : "POST", body });
      setMsg({ tone: "success", text: `Coupon ${c.code.toUpperCase()} saved.` }); setEditCoupon(null); coupons.reload();
    } catch (err: any) { setMsg({ tone: "error", text: err.message }); }
  }

  return (
    <>
      <AdminTitle title="Offers & coupons" sub="Every price, discount, date and audience is editable here — nothing is hard-coded. Changes are recorded in the audit log."
        action={<div className="flex gap-2"><button className="btn-primary" onClick={() => setEditOffer({ ...blankOffer })}>New offer</button><button className="btn-outline" onClick={() => setEditCoupon({ ...blankCoupon })}>New coupon</button></div>} />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <Alert tone="info">Rules people see at checkout: an intro offer is once per person (also per phone and app install) and can&apos;t be combined with a coupon; a coupon or discount lowers today&apos;s payment only; the regular price and renewal date are always shown before paying. Don&apos;t show an end date unless the offer really ends then.</Alert>

      <h2 className="mb-3 mt-8 text-xl font-extrabold">Offers</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {offers.data.offers.map((o) => (
          <div key={o.id} className={`panel p-4 ${o.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold">{o.name} {o.badge && <span className="ml-1 rounded-full bg-marigold-wash px-2 py-0.5 text-xs">{o.badge}</span>}</p>
                <p className="text-sm">“{o.headline}” · {o.planCode.replace("_", " ")}</p>
                <p className="mt-1 text-sm text-ink-soft">{describe(o)}</p>
                <p className="text-xs text-ink-faint">{o.active ? "Active" : "Off"} · priority {o.priority}{o.startsAt ? ` · from ${new Date(o.startsAt).toLocaleDateString()}` : ""}{o.endsAt ? ` · until ${new Date(o.endsAt).toLocaleDateString()}` : ""}</p>
              </div>
              <button className="text-sm font-semibold underline" onClick={() => setEditOffer({ id: o.id, name: o.name, kind: o.kind, headline: o.headline, badge: o.badge ?? "", planCode: o.planCode, country: o.country, genders: o.genders ? o.genders.split(",") : [], audience: o.audience, price: o.priceMinor ? String(o.priceMinor / 100) : "", days: o.days ? String(o.days) : "", discountPct: o.discountPct ? String(o.discountPct) : "", oncePerUser: o.oncePerUser, priority: String(o.priority), startsAt: dt(o.startsAt), endsAt: dt(o.endsAt), active: o.active })}>Edit</button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-xl font-extrabold">Coupons</h2>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-ink-soft"><tr>{["Code", "Discount", "Who", "Used", "Valid", ""].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
          <tbody>
            {coupons.data.coupons.map((c) => (
              <tr key={c.id} className={`border-t border-mist ${c.active ? "" : "opacity-60"}`}>
                <td className="px-4 py-2.5 font-mono font-semibold">{c.code}</td>
                <td className="px-4 py-2.5">{c.kind === "PERCENT" ? `${c.value}%` : formatMoney(c.value, c.currency ?? "INR")}{c.maxDiscountMinor ? ` (max ${formatMoney(c.maxDiscountMinor, "INR")})` : ""}</td>
                <td className="px-4 py-2.5">{[c.audience !== "ALL" && c.audience.toLowerCase(), c.countries, c.plans, c.genders].filter(Boolean).join(" · ") || "Everyone"}</td>
                <td className="px-4 py-2.5">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</td>
                <td className="px-4 py-2.5">{c.active ? (c.endsAt ? `until ${new Date(c.endsAt).toLocaleDateString()}` : "No end date") : "Off"}</td>
                <td className="px-4 py-2.5 text-right"><button className="font-semibold underline" onClick={() => setEditCoupon({ id: c.id, code: c.code, kind: c.kind, value: String(c.kind === "PERCENT" ? c.value : c.value / 100), currency: c.currency ?? "INR", maxDiscount: c.maxDiscountMinor ? String(c.maxDiscountMinor / 100) : "", minPurchase: c.minPurchaseMinor ? String(c.minPurchaseMinor / 100) : "", audience: c.audience, countries: c.countries, plans: c.plans ? c.plans.split(",") : [], genders: c.genders ? c.genders.split(",") : [], usageLimit: c.usageLimit ? String(c.usageLimit) : "", perUserLimit: String(c.perUserLimit), startsAt: dt(c.startsAt), endsAt: dt(c.endsAt), active: c.active })}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!editOffer} onClose={() => setEditOffer(null)} title={editOffer?.id ? "Edit offer" : "New offer"}>
        {editOffer && (
          <div className="grid gap-3">
            <label className="text-sm font-semibold">Internal name<input className="input mt-1" value={editOffer.name} onChange={(e) => setEditOffer({ ...editOffer, name: e.target.value })} placeholder="Diwali Special 2026" /></label>
            <label className="text-sm font-semibold">Type<select className="input mt-1" value={editOffer.kind} onChange={(e) => setEditOffer({ ...editOffer, kind: e.target.value })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="text-sm font-semibold">Headline shown to people<input className="input mt-1" value={editOffer.headline} onChange={(e) => setEditOffer({ ...editOffer, headline: e.target.value })} placeholder="Try Premium for ₹1" /></label>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-sm font-semibold">Badge<input className="input mt-1" value={editOffer.badge} onChange={(e) => setEditOffer({ ...editOffer, badge: e.target.value })} placeholder="Festival offer" /></label>
              <label className="text-sm font-semibold">Plan<select className="input mt-1" value={editOffer.planCode} onChange={(e) => setEditOffer({ ...editOffer, planCode: e.target.value })}>{["PREMIUM", "PREMIUM_PLUS", "VIP"].map((p) => <option key={p}>{p}</option>)}</select></label>
              <label className="text-sm font-semibold">Country<input className="input mt-1" value={editOffer.country} onChange={(e) => setEditOffer({ ...editOffer, country: e.target.value.toUpperCase() })} /></label>
            </div>
            {editOffer.kind === "DISCOUNT" ? (
              <label className="text-sm font-semibold">% off the first payment<input className="input mt-1" type="number" value={editOffer.discountPct} onChange={(e) => setEditOffer({ ...editOffer, discountPct: e.target.value })} /></label>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-semibold">Price today (₹)<input className="input mt-1" inputMode="decimal" value={editOffer.price} onChange={(e) => setEditOffer({ ...editOffer, price: e.target.value })} /></label>
                <label className="text-sm font-semibold">{editOffer.kind === "INTRO" ? "Intro length (days)" : "Pass length (days)"}<input className="input mt-1" type="number" value={editOffer.days} onChange={(e) => setEditOffer({ ...editOffer, days: e.target.value })} /></label>
              </div>
            )}
            <fieldset className="text-sm"><legend className="font-semibold">Only for (leave empty for everyone)</legend>
              <div className="mt-1 flex gap-3">{["MAN", "WOMAN", "NONBINARY"].map((g) => <label key={g} className="flex items-center gap-1"><input type="checkbox" checked={editOffer.genders.includes(g)} onChange={() => setEditOffer({ ...editOffer, genders: toggle(editOffer.genders, g) })} />{g.toLowerCase()}</label>)}</div>
              <p className="text-xs text-ink-faint">Only allowed in countries where gender pricing is enabled (Settings).</p>
            </fieldset>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-semibold">Audience<select className="input mt-1" value={editOffer.audience} onChange={(e) => setEditOffer({ ...editOffer, audience: e.target.value })}><option value="ALL">Everyone</option><option value="NEW">First-time subscribers</option><option value="RETURNING">Past subscribers (win-back)</option></select></label>
              <label className="text-sm font-semibold">Priority<input className="input mt-1" type="number" value={editOffer.priority} onChange={(e) => setEditOffer({ ...editOffer, priority: e.target.value })} /></label>
              <label className="text-sm font-semibold">Starts<input className="input mt-1" type="datetime-local" value={editOffer.startsAt} onChange={(e) => setEditOffer({ ...editOffer, startsAt: e.target.value })} /></label>
              <label className="text-sm font-semibold">Ends<input className="input mt-1" type="datetime-local" value={editOffer.endsAt} onChange={(e) => setEditOffer({ ...editOffer, endsAt: e.target.value })} /></label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editOffer.oncePerUser} onChange={(e) => setEditOffer({ ...editOffer, oncePerUser: e.target.checked })} /> Once per person</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editOffer.active} onChange={(e) => setEditOffer({ ...editOffer, active: e.target.checked })} /> Active</label>
            <button className="btn-primary" onClick={saveOffer}>Save offer</button>
          </div>
        )}
      </Modal>

      <Modal open={!!editCoupon} onClose={() => setEditCoupon(null)} title={editCoupon?.id ? "Edit coupon" : "New coupon"}>
        {editCoupon && (
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-1 text-sm font-semibold">Code<input className="input mt-1 font-mono uppercase" value={editCoupon.code} onChange={(e) => setEditCoupon({ ...editCoupon, code: e.target.value.toUpperCase() })} placeholder="WELCOME50" /></label>
              <label className="text-sm font-semibold">Type<select className="input mt-1" value={editCoupon.kind} onChange={(e) => setEditCoupon({ ...editCoupon, kind: e.target.value })}><option value="PERCENT">% off</option><option value="FIXED">Fixed amount</option></select></label>
              <label className="text-sm font-semibold">{editCoupon.kind === "PERCENT" ? "Percent" : "Amount (₹)"}<input className="input mt-1" inputMode="decimal" value={editCoupon.value} onChange={(e) => setEditCoupon({ ...editCoupon, value: e.target.value })} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-semibold">Max discount (₹)<input className="input mt-1" inputMode="decimal" value={editCoupon.maxDiscount} onChange={(e) => setEditCoupon({ ...editCoupon, maxDiscount: e.target.value })} /></label>
              <label className="text-sm font-semibold">Min purchase (₹)<input className="input mt-1" inputMode="decimal" value={editCoupon.minPurchase} onChange={(e) => setEditCoupon({ ...editCoupon, minPurchase: e.target.value })} /></label>
              <label className="text-sm font-semibold">Total uses<input className="input mt-1" type="number" value={editCoupon.usageLimit} onChange={(e) => setEditCoupon({ ...editCoupon, usageLimit: e.target.value })} placeholder="Unlimited" /></label>
              <label className="text-sm font-semibold">Uses per person<input className="input mt-1" type="number" value={editCoupon.perUserLimit} onChange={(e) => setEditCoupon({ ...editCoupon, perUserLimit: e.target.value })} /></label>
              <label className="text-sm font-semibold">Audience<select className="input mt-1" value={editCoupon.audience} onChange={(e) => setEditCoupon({ ...editCoupon, audience: e.target.value })}><option value="ALL">Everyone</option><option value="NEW">New subscribers</option><option value="EXISTING">Existing members</option></select></label>
              <label className="text-sm font-semibold">Countries<input className="input mt-1" value={editCoupon.countries} onChange={(e) => setEditCoupon({ ...editCoupon, countries: e.target.value })} placeholder="Any" /></label>
              <label className="text-sm font-semibold">Starts<input className="input mt-1" type="datetime-local" value={editCoupon.startsAt} onChange={(e) => setEditCoupon({ ...editCoupon, startsAt: e.target.value })} /></label>
              <label className="text-sm font-semibold">Expires<input className="input mt-1" type="datetime-local" value={editCoupon.endsAt} onChange={(e) => setEditCoupon({ ...editCoupon, endsAt: e.target.value })} /></label>
            </div>
            <fieldset className="text-sm"><legend className="font-semibold">Plans (empty = all)</legend><div className="mt-1 flex gap-3">{["PREMIUM", "PREMIUM_PLUS", "VIP"].map((p) => <label key={p} className="flex items-center gap-1"><input type="checkbox" checked={editCoupon.plans.includes(p)} onChange={() => setEditCoupon({ ...editCoupon, plans: toggle(editCoupon.plans, p) })} />{p.replace("_", " ").toLowerCase()}</label>)}</div></fieldset>
            <fieldset className="text-sm"><legend className="font-semibold">Gender (empty = everyone; gender-pricing countries only)</legend><div className="mt-1 flex gap-3">{["MAN", "WOMAN", "NONBINARY"].map((g) => <label key={g} className="flex items-center gap-1"><input type="checkbox" checked={editCoupon.genders.includes(g)} onChange={() => setEditCoupon({ ...editCoupon, genders: toggle(editCoupon.genders, g) })} />{g.toLowerCase()}</label>)}</div></fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editCoupon.active} onChange={(e) => setEditCoupon({ ...editCoupon, active: e.target.checked })} /> Active</label>
            <button className="btn-primary" onClick={saveCoupon}>Save coupon</button>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function Page() {
  return <AdminShell><Offers /></AdminShell>;
}
