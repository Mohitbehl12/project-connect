"use client";
import { useState } from "react";
import { AdminShell, AdminTitle, useStaff } from "@/components/AdminShell";
import { Alert, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";

type Data = {
  ready: boolean;
  checks: { id: string; label: string; ok: boolean; detail: string }[];
  items: { id: string; group: string; label: string; status: string; by: string; at: string; note: string }[];
};

function Launch() {
  const staff = useStaff();
  const q = useApi<Data>("/api/admin/launch");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (q.error) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  const canEdit = staff.permissions.includes("config.edit");
  async function sign(id: string, status: string) {
    const by = status === "OPEN" ? "" : prompt("Who did this review or test? (person or firm)") ?? "";
    if (status !== "OPEN" && !by) return;
    const note = status === "OPEN" ? "" : prompt("Notes or report reference (optional)") ?? "";
    setMsg(null);
    try { await api("/api/admin/launch", { method: "PUT", body: { id, status, by, note } }); q.reload(); }
    catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  const groups = [...new Set(q.data.items.map((i) => i.group))];
  const passed = q.data.checks.filter((c) => c.ok).length;
  return (
    <>
      <AdminTitle title="Launch readiness" sub="What must be true before real members join. Automatic checks read the live settings; the rest are signed off by the person or firm who did the work. This page never declares the service “compliant” or “secure” — it records what has been checked." />
      <div className="mb-6"><Alert tone={q.data.ready ? "success" : "warn"}>{q.data.ready ? "Every check passes and every item is signed off." : `Not ready yet: ${passed} of ${q.data.checks.length} automatic checks pass; ${q.data.items.filter((i) => i.status === "OPEN").length} sign-off items open.`}</Alert></div>
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <section className="panel p-5">
        <h2 className="text-lg font-bold">Automatic checks</h2>
        <ul className="mt-3 divide-y divide-mist">
          {q.data.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-2 text-sm">
              <span aria-hidden className={c.ok ? "text-sage" : "text-rose"}>{c.ok ? "✓" : "✗"}</span>
              <span className="flex-1"><strong>{c.label}</strong><br /><span className="text-ink-soft">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      </section>
      {groups.map((g) => (
        <section key={g} className="panel mt-4 p-5">
          <h2 className="text-lg font-bold">{g}</h2>
          <ul className="mt-3 divide-y divide-mist">
            {q.data!.items.filter((i) => i.group === g).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span aria-hidden className={i.status === "OPEN" ? "text-ink-faint" : "text-sage"}>{i.status === "OPEN" ? "○" : "✓"}</span>
                <span className="flex-1">{i.label}{i.status !== "OPEN" && <span className="block text-ink-soft">{i.status === "DONE" ? "Done" : "Not applicable"} · {i.by} · {new Date(i.at).toLocaleDateString()}{i.note ? ` · ${i.note}` : ""}</span>}</span>
                {canEdit && (i.status === "OPEN"
                  ? <><button className="underline" onClick={() => sign(i.id, "DONE")}>Sign off</button><button className="underline text-ink-soft" onClick={() => sign(i.id, "NOT_APPLICABLE")}>N/A</button></>
                  : <button className="underline text-ink-soft" onClick={() => sign(i.id, "OPEN")}>Reopen</button>)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export default function Page() {
  return <AdminShell><Launch /></AdminShell>;
}
