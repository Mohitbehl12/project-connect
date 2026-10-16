"use client";
import { useEffect, useState } from "react";
import { AdminShell, AdminTitle, useStaff } from "@/components/AdminShell";
import { Alert, Spinner, Toggle } from "@/components/ui";
import { api, formatMoney, useApi } from "@/lib/client";

const WEIGHT_LABELS: Record<string, string> = {
  intent: "Relationship goals", personality: "Personality", interests: "Shared interests", lifestyle: "Lifestyle",
  distance: "Distance", age: "Age fit", quality: "Profile quality & verification",
};

function Settings() {
  const staff = useStaff();
  const { data, error, reload } = useApi<{ config: Record<string, any>; plans: any[] }>("/api/admin/config");
  const [cfg, setCfg] = useState<Record<string, any> | null>(null);
  const [plans, setPlans] = useState<any[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => { if (data) { setCfg(structuredClone(data.config)); setPlans(structuredClone(data.plans)); } }, [data]);

  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (!cfg || !plans) return <Spinner />;
  const w = cfg["matching.weights"];
  const total = Object.values(w).reduce((s: number, x) => s + Number(x), 0) as number;

  async function save(body: object, what: string) {
    setMsg(null);
    try { await api("/api/admin/config", { method: "PUT", body }); setMsg({ tone: "success", text: `${what} saved.` }); reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }

  return (
    <>
      <AdminTitle title="Settings & plans" />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-lg font-bold">Matching weights</h2>
          <p className="mb-4 text-sm text-ink-soft">Relative importance of each factor in the compatibility score. Changes apply to discovery immediately.</p>
          <div className="space-y-4">
            {Object.keys(WEIGHT_LABELS).map((k) => (
              <div key={k}>
                <div className="flex justify-between text-sm"><label htmlFor={`w-${k}`} className="font-semibold">{WEIGHT_LABELS[k]}</label><span className="text-ink-soft">{w[k]} · {total ? Math.round((w[k] / total) * 100) : 0}%</span></div>
                <input id={`w-${k}`} type="range" min={0} max={50} value={w[k]} className="w-full accent-ink"
                  onChange={(e) => setCfg({ ...cfg, "matching.weights": { ...w, [k]: Number(e.target.value) } })} />
              </div>
            ))}
          </div>
          <button className="btn-primary mt-4" disabled={!staff.permissions.includes("config.edit")} onClick={() => save({ config: { "matching.weights": w } }, "Matching weights")}>Save weights</button>
        </section>

        <section className="panel p-5">
          <h2 className="text-lg font-bold">Safety & limits</h2>
          <div className="mt-4 space-y-4">
            {[
              ["chat.maxUnansweredMessages", "Messages allowed before a reply", "Stops one person from flooding a chat."],
              ["safety.autoSuspendReportThreshold", "Independent reports before auto-suspension", "Counted over 30 days. The account is paused until reviewed."],
              ["discovery.batchSize", "Profiles per discovery batch", ""],
            ].map(([k, label, hint]) => (
              <div key={k}>
                <label className="label" htmlFor={k}>{label}</label>
                <input id={k} type="number" className="input max-w-32" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })} />
                {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
              </div>
            ))}
          </div>
          <button className="btn-primary mt-4" onClick={() => save({ config: {
            "chat.maxUnansweredMessages": cfg["chat.maxUnansweredMessages"], "safety.autoSuspendReportThreshold": cfg["safety.autoSuspendReportThreshold"], "discovery.batchSize": cfg["discovery.batchSize"],
          } }, "Limits")}>Save limits</button>
        </section>
      </div>

      <section className="panel mt-6 p-5">
        <h2 className="text-lg font-bold">Billing, rewards and data retention</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="gpc">Countries with gender price groups</label>
            <input id="gpc" className="input" value={(cfg["billing.genderPricingCountries"] ?? []).join(", ")} onChange={(e) => setCfg({ ...cfg, "billing.genderPricingCountries": e.target.value.toUpperCase().split(/[ ,]+/).filter(Boolean) })} />
            <p className="mt-1 text-xs text-ink-faint">Two-letter codes, e.g. IN. Gender-based pricing is unlawful in some places (e.g. the EU) — check with a lawyer before adding a country.</p>
          </div>
          {[
            ["billing.reminderDays", "Renewal reminder (days before)", "In addition to the bank's own pre-debit notice."],
            ["billing.graceDays", "Grace period after a failed renewal (days)", "Premium stays on while the gateway retries."],
            ["referral.rewardDays", "Premium days per verified referral", ""],
            ["referral.monthlyCap", "Max referral rewards per person per month", "Limits farming."],
            ["rewards.completeProfileBoostMinutes", "Boost for a 100% profile (minutes)", "0 turns it off."],
            ["rewards.womenFreeDays", "Free Premium for women (days)", "Given once when sign-up is finished, in gender-pricing countries. 0 turns it off."],
            ["rewards.verifiedPremiumDays", "Premium days for completing verification", "0 turns it off."],
            ["retention.deletedMessageDays", "Keep deleted messages for safety review (days)", "Then the text is purged."],
            ["retention.loginEventDays", "Keep sign-in history (days)", ""],
          ].map(([k, label, hint]) => (
            <div key={k}>
              <label className="label" htmlFor={k}>{label}</label>
              <input id={k} type="number" className="input max-w-32" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })} />
              {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
            </div>
          ))}
        </div>
        <button className="btn-primary mt-4" disabled={!staff.permissions.includes("config.edit")} onClick={() => save({ config: Object.fromEntries(["billing.genderPricingCountries", "billing.reminderDays", "billing.graceDays", "referral.rewardDays", "referral.monthlyCap", "rewards.completeProfileBoostMinutes", "rewards.womenFreeDays", "rewards.verifiedPremiumDays", "retention.deletedMessageDays", "retention.loginEventDays"].map((k) => [k, cfg[k]])) }, "Billing settings")}>Save billing settings</button>
      </section>

      <h2 className="mb-3 mt-10 text-2xl font-extrabold">Plans and prices</h2>
      <p className="mb-4 text-ink-soft">Amounts are in minor units (paise, cents): 10000 = ₹100. Use country “*” for the default price. Gender price groups only apply in the countries listed under Billing below; everyone not in a group pays the “Everyone else” price. Changing a price affects new subscriptions; existing subscribers keep theirs until they change plan. Intro offers like “₹1 for 15 days” live in Offers & coupons.</p>
      <div className="grid gap-4 xl:grid-cols-2">
        {plans.map((p, pi) => {
          const upd = (fn: (x: any) => void) => { const next = structuredClone(plans); fn(next[pi]); setPlans(next); };
          return (
            <section key={p.id} className="panel p-5">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{p.name} <span className="text-sm text-ink-faint">{p.code}</span></h3></div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <label>Likes per day (-1 = unlimited)<input type="number" className="input mt-1" value={p.features.dailyLikes} onChange={(e) => upd((x) => { x.features.dailyLikes = Number(e.target.value); })} /></label>
                <label>Priority likes per day<input type="number" className="input mt-1" value={p.features.dailyPriorityLikes} onChange={(e) => upd((x) => { x.features.dailyPriorityLikes = Number(e.target.value); })} /></label>
                <label>Boosts per month<input type="number" className="input mt-1" value={p.features.monthlyBoosts} onChange={(e) => upd((x) => { x.features.monthlyBoosts = Number(e.target.value); })} /></label>
              </div>
              <div className="mt-2 divide-y divide-mist">
                {(["seeWhoLiked", "advancedFilters", "incognito", "travelMode"] as const).map((k) => (
                  <Toggle key={k} label={{ seeWhoLiked: "See who liked you", advancedFilters: "Advanced filters", incognito: "Incognito", travelMode: "Travel mode" }[k]} checked={!!p.features[k]} onChange={(v) => upd((x) => { x.features[k] = v; })} />
                ))}
              </div>
              {p.code !== "FREE" && (
                <table className="mt-3 w-full text-sm">
                  <thead className="text-left text-ink-faint"><tr><th>Country</th><th>Price group</th><th>Currency</th><th>Price</th><th>Promo</th><th>Days</th><th></th></tr></thead>
                  <tbody>
                    {p.prices.map((pr: any, i: number) => (
                      <tr key={pr.id ?? i}>
                        <td><input aria-label="Country" className="input px-2 py-1" value={pr.country} onChange={(e) => upd((x) => { x.prices[i].country = e.target.value.toUpperCase(); })} /></td>
                        <td>
                          <select aria-label="Price group" className="input px-2 py-1" value={pr.segment ?? "*"} onChange={(e) => upd((x) => { x.prices[i].segment = e.target.value; })}>
                            <option value="*">Everyone else</option><option value="gender:MAN">Men</option><option value="gender:WOMAN">Women</option><option value="gender:NONBINARY">Non-binary</option>
                          </select>
                        </td>
                        <td><input aria-label="Currency" className="input px-2 py-1" value={pr.currency} onChange={(e) => upd((x) => { x.prices[i].currency = e.target.value.toUpperCase(); })} /></td>
                        <td><input aria-label="Price" type="number" className="input px-2 py-1" value={pr.amountMinor} onChange={(e) => upd((x) => { x.prices[i].amountMinor = Number(e.target.value); })} /></td>
                        <td><input aria-label="Promo price" type="number" className="input px-2 py-1" value={pr.promoMinor ?? ""} onChange={(e) => upd((x) => { x.prices[i].promoMinor = e.target.value === "" ? null : Number(e.target.value); })} /></td>
                        <td><input aria-label="Days" type="number" className="input px-2 py-1" value={pr.durationDays} onChange={(e) => upd((x) => { x.prices[i].durationDays = Number(e.target.value); })} /></td>
                        <td className="pl-2 text-xs text-ink-faint">{/^[A-Z]{3}$/.test(pr.currency) ? formatMoney(pr.promoMinor ?? pr.amountMinor, pr.currency) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-4 flex gap-2">
                {p.code !== "FREE" && <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => upd((x) => { x.prices.push({ country: "", currency: "", amountMinor: 0, durationDays: 30, active: true, segment: "*" }); })}>Add country price</button>}
                <button className="btn-primary px-4 py-1.5 text-sm" disabled={!staff.permissions.includes("plans.edit")}
                  onClick={() => save({ plans: [{ id: p.id, features: p.features, prices: p.prices.map(({ planId: _p, ...pr }: any) => pr) }] }, `${p.name} plan`)}>Save {p.name}</button>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

export default function Page() {
  return <AdminShell><Settings /></AdminShell>;
}
