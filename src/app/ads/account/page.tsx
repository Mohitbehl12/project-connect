"use client";
import { useState } from "react";
import { AdsShell, VERIFICATION, useAccount } from "@/components/ads/AdsShell";
import { Alert, Field } from "@/components/ui";
import { api } from "@/lib/client";

function Account() {
  const { account, reload } = useAccount();
  const a = account.advertiser;
  const [f, setF] = useState({ contactName: a.contactName, phone: a.phone, website: a.website ?? "", address: a.address ?? "", gstin: a.gstin ?? "" });
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const input = (k: keyof typeof f) => (id: string) => <input id={id} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-extrabold">Business details</h1>
      <div className="panel mt-4 p-4 text-sm">
        <p><strong>{a.businessName}</strong> · {a.categoryLabel}</p>
        <p className="text-ink-soft">{a.email}</p>
        <p className="mt-2">Verification: <strong>{VERIFICATION[a.verification]}</strong></p>
        <p className="mt-1 text-xs text-ink-faint">Verification means we checked who your business is. It is not a guarantee of your products or services, and members are told so. To change the business name or category, contact support.</p>
      </div>
      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setMsg(null);
        try { await api("/api/ads/account", { method: "PUT", body: f }); setMsg({ tone: "success", text: "Saved." }); reload(); } catch (x: any) { setMsg({ tone: "error", text: x.message }); }
      }}>
        <Field label="Contact person">{input("contactName")}</Field>
        <Field label="Phone">{input("phone")}</Field>
        <Field label="Website or social page">{input("website")}</Field>
        <Field label="Address">{input("address")}</Field>
        <Field label="GSTIN">{input("gstin")}</Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <button className="btn-primary">Save</button>
      </form>
    </div>
  );
}

export default function Page() {
  return <AdsShell><Account /></AdsShell>;
}
