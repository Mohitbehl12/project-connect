"use client";
import { useState } from "react";
import { Alert, Field } from "@/components/ui";
import { api } from "@/lib/client";

export function GrievanceForm({ categories }: { categories: Record<string, string> }) {
  const [f, setF] = useState({ name: "", email: "", category: "", details: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ refNo: string; resolveDueAt: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { setDone(await api("/api/grievances", { body: f })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  if (done) return (
    <div className="space-y-3">
      <Alert tone="success">We&apos;ve received your complaint. Your reference number is <strong>{done.refNo}</strong>.</Alert>
      <p className="text-ink-soft">We&apos;ll reply by email by {new Date(done.resolveDueAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. Keep the reference number if you write to us about it.</p>
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Your name">{(id) => <input id={id} className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoComplete="name" />}</Field>
      <Field label="Email for our reply">{(id) => <input id={id} type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="email" />}</Field>
      <div>
        <label className="label" htmlFor="cat">What is it about?</label>
        <select id="cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} required>
          <option value="" disabled>Choose one</option>
          {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {f.category === "INTIMATE_OR_IMPERSONATION" && <p className="mt-1 text-sm text-ink-soft">We act on these within 24 hours. If you have the person&apos;s profile name, include it.</p>}
      </div>
      <div>
        <label className="label" htmlFor="det">What happened?</label>
        <textarea id="det" className="input min-h-40" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} required minLength={20} maxLength={4000}
          placeholder="Tell us what happened and what you'd like us to do. Don't include passwords or card details." />
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send complaint"}</button>
      <p className="text-sm text-ink-faint">If you&apos;re in danger right now, call 112.</p>
    </form>
  );
}
