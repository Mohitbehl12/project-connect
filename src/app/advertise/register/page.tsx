"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PublicShell } from "@/components/PublicShell";
import { Alert, Field } from "@/components/ui";
import { api, useApi } from "@/lib/client";

export default function RegisterAdvertiser() {
  const router = useRouter();
  const meta = useApi<{ categories: Record<string, string> }>("/api/ads/meta");
  const [f, setF] = useState({ businessName: "", contactName: "", email: "", phone: "", category: "", website: "", address: "", gstin: "", password: "", acceptTerms: false });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await api<{ next: string }>("/api/ads/register", { body: { ...f, website: f.website || undefined, address: f.address || undefined, gstin: f.gstin || undefined } });
      router.push(r.next);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  const input = (k: keyof typeof f, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (id: string) =>
    <input id={id} className="input" value={String(f[k])} onChange={(e) => set(k, e.target.value)} {...props} />;
  return (
    <PublicShell>
      <div className="mx-auto max-w-xl px-4 py-12">
        <p className="text-sm font-bold uppercase tracking-widest text-[#A5781F]">Kinara Ads</p>
        <h1 className="mt-1 text-4xl font-extrabold">Create a business account</h1>
        <p className="mt-2 text-ink-soft">This is separate from a dating profile. Use a work email. We verify your business before your ads go live.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <Field label="Business name">{input("businessName", { required: true, maxLength: 120, autoComplete: "organization" })}</Field>
          <Field label="Business category">
            {(id) => (
              <select id={id} className="input" required value={f.category} onChange={(e) => set("category", e.target.value)}>
                <option value="">Choose a category</option>
                {Object.entries(meta.data?.categories ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
          </Field>
          <Field label="Contact person">{input("contactName", { required: true, maxLength: 80, autoComplete: "name" })}</Field>
          <Field label="Work email" hint="You'll log in with this and we'll send a code to confirm it.">{input("email", { required: true, type: "email", autoComplete: "email" })}</Field>
          <Field label="Phone number" hint="For our review team only. Never shown in your ads.">{input("phone", { required: true, type: "tel", autoComplete: "tel", placeholder: "+91 98765 43210" })}</Field>
          <Field label="Website or social media page" hint="Must start with https://">{input("website", { type: "url", placeholder: "https://" })}</Field>
          <Field label="Business address (if you have one)">{input("address", { maxLength: 300, autoComplete: "street-address" })}</Field>
          <Field label="GSTIN (if registered)" hint="15 characters. Shown on your receipts.">{input("gstin", { maxLength: 15 })}</Field>
          <Field label="Password" hint="At least 8 characters, including a letter and a number.">{input("password", { required: true, type: "password", autoComplete: "new-password" })}</Field>
          <p className="text-sm text-ink-soft">Payment details are entered securely with our payment provider when you add balance — we never store your card.</p>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={f.acceptTerms} onChange={(e) => set("acceptTerms", e.target.checked)} />
            <span>I am 18 or older, authorised to act for this business, and I accept the <Link href="/legal/advertising" target="_blank" className="underline">Advertising Terms and Policy</Link> and <Link href="/legal/terms" target="_blank" className="underline">Terms of Service</Link>.</span>
          </label>
          {err && <Alert tone="error">{err}</Alert>}
          <button className="btn-primary w-full py-3" disabled={busy || !f.acceptTerms}>{busy ? "Creating…" : "Create business account"}</button>
          <p className="text-center text-sm text-ink-soft">Already advertising? <Link href="/login?next=/ads" className="font-semibold underline">Log in</Link></p>
        </form>
      </div>
    </PublicShell>
  );
}
