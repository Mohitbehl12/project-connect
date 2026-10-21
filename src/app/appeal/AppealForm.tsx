"use client";
import { useState } from "react";
import { Alert, Field } from "@/components/ui";
import { api } from "@/lib/client";

export function AppealForm({ kinds }: { kinds: Record<string, string> }) {
  const [f, setF] = useState({ email: "", kind: "", details: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ caseNo: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { setDone(await api("/api/appeals", { body: { kind: f.kind, details: f.details, email: f.email || undefined } })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  if (done) return <Alert tone="success">Your appeal has been received. Your case number is <strong>{done.caseNo}</strong>. We&apos;ll reply by email or in the app.</Alert>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email on your account (if you can't sign in)">{(id) => <input id={id} type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />}</Field>
      <div>
        <label className="label" htmlFor="kind">What are you appealing?</label>
        <select id="kind" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} required>
          <option value="" disabled>Choose one</option>
          {Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="det">Why do you think it was wrong?</label>
        <textarea id="det" className="input min-h-40" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} required minLength={20} maxLength={4000}
          placeholder="Explain what happened. Don't include passwords, card details or ID numbers." />
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send appeal"}</button>
    </form>
  );
}
