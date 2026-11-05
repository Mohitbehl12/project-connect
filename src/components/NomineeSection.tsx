"use client";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui";
import { api, useApi } from "@/lib/client";

type Nominee = { name: string; relationship: string; contact: string } | null;

/** Name someone to act on your data if you can't (DPDP Act 2023 s.14). */
export function NomineeSection() {
  const q = useApi<{ nominee: Nominee; relationships: string[] }>("/api/privacy/nominee");
  const [f, setF] = useState({ name: "", relationship: "", contact: "" });
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  useEffect(() => { if (q.data?.nominee) setF(q.data.nominee); }, [q.data?.nominee]);
  const n = q.data?.nominee;

  async function save() {
    setMsg(null);
    try { await api("/api/privacy/nominee", { method: "PUT", body: f }); setEditing(false); setMsg({ tone: "success", text: "Saved." }); q.reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  async function remove() {
    setMsg(null);
    try { await api("/api/privacy/nominee", { method: "DELETE" }); setF({ name: "", relationship: "", contact: "" }); setMsg({ tone: "success", text: "Removed." }); q.reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }

  return (
    <section id="nominee" className="panel p-5 md:p-6">
      <h2 className="mb-2 text-xl font-bold">Nominee</h2>
      <p className="text-ink-soft">Name someone who can ask us to see, correct or delete your data if you die or can't act yourself. We never contact them. They get in touch with our Grievance Officer, and we ask for proof before acting.</p>
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {n && !editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="flex-1"><strong>{n.name}</strong> · {n.relationship} · <span className="text-ink-soft">{n.contact}</span></p>
          <button className="btn-outline" onClick={() => setEditing(true)}>Change</button>
          <button className="btn-ghost text-rose" onClick={remove}>Remove</button>
        </div>
      ) : (editing || !n) && q.data ? (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input className="input" aria-label="Their full name" placeholder="Their full name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select className="input" aria-label="Relationship" value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })}>
            <option value="">Relationship…</option>
            {q.data.relationships.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input className="input" aria-label="Their email or phone" placeholder="Their email or phone" maxLength={120} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
          <div className="md:col-span-3 flex gap-3">
            <button className="btn-primary" disabled={!f.name || !f.relationship || !f.contact} onClick={save}>Save nominee</button>
            {editing && <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </div>
      ) : null}
    </section>
  );
}
