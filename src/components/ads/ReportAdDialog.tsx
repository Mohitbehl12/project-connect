"use client";
import { useState } from "react";
import { Alert, Modal } from "@/components/ui";
import { api } from "@/lib/client";

const REASONS: Record<string, string> = { MISLEADING: "Misleading", SCAM: "Scam", OFFENSIVE: "Offensive", INAPPROPRIATE: "Inappropriate", FAKE_BUSINESS: "Fake business", DANGEROUS: "Dangerous", MISMATCH: "Doesn't match the website", OTHER: "Other" };

export function ReportAdDialog({ open, adId, onClose, onDone }: { open: boolean; adId: string; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [err, setErr] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Report ad">
      <div className="space-y-2">
        {Object.entries(REASONS).map(([k, v]) => (
          <label key={k} className="flex items-center gap-3"><input type="radio" name="ad-reason" checked={reason === k} onChange={() => setReason(k)} />{v}</label>
        ))}
        <textarea className="input min-h-16" placeholder="Anything else? (optional)" aria-label="Details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
        {err && <Alert tone="error">{err}</Alert>}
        <button className="btn-primary w-full" disabled={!reason} onClick={async () => {
          try { const r = await api<{ message: string }>(`/api/ads/${adId}/report`, { body: { reason, details } }); onDone(r.message); } catch (e: any) { setErr(e.message); }
        }}>Send report</button>
      </div>
    </Modal>
  );
}
