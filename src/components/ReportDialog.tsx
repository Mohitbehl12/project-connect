"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { REPORT_CATEGORIES } from "@/lib/constants";
import { Alert, Field, Modal, Segmented } from "./ui";

export function ReportDialog({ open, onClose, userId, name, messageId, onDone }: {
  open: boolean; onClose: () => void; userId: string; name: string; messageId?: string; onDone: () => void;
}) {
  const [category, setCategory] = useState<string>("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!category) return setErr("Choose what happened.");
    setBusy(true);
    setErr("");
    try {
      await api("/api/reports", { body: { reportedId: userId, category, details, messageId, alsoBlock: true } });
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Report ${name}`}>
      <p className="mb-4 text-ink-soft">{name} won't know you reported them. We'll also block them so you won't see each other again.</p>
      {(category === "SAFETY" || category === "UNDERAGE") && (
        <div className="mb-4"><Alert tone="warn">If you're in immediate danger, contact local emergency services first — 112 in India, 911 in the US, 999 in the UK.</Alert></div>
      )}
      <div className="space-y-5">
        <div>
          <p className="label">What happened?</p>
          <Segmented options={REPORT_CATEGORIES} value={category} onChange={setCategory} />
        </div>
        <Field label="Anything else we should know? (optional)">
          {(id) => <textarea id={id} className="input min-h-24" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />}
        </Field>
        {err && <Alert tone="error">{err}</Alert>}
        <button className="btn-danger w-full" disabled={busy} onClick={submit}>{busy ? "Sending…" : "Report and block"}</button>
      </div>
    </Modal>
  );
}
