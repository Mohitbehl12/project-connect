"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { ROLES } from "@/lib/constants";
import { useStaff } from "./AdminShell";
import { Alert, Modal } from "./ui";

const LABELS: Record<string, string> = {
  WARN: "Send warning", SUSPEND: "Suspend", BAN: "Ban permanently", RESTORE: "Restore account",
  VERIFY: "Approve verification", REJECT_VERIFICATION: "Reject verification", SET_ROLE: "Change role", REVOKE_SESSIONS: "Log out everywhere",
};
const NEEDS: Record<string, string> = { BAN: "users.ban", SET_ROLE: "roles.assign", VERIFY: "users.verify", REJECT_VERIFICATION: "users.verify" };

export function ModerationActions({ userId, status, selfieStatus, reportId, onDone }: { userId: string; status: string; selfieStatus: string; reportId?: string; onDone: () => void }) {
  const staff = useStaff();
  const [action, setAction] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [role, setRole] = useState("MODERATOR");
  const [err, setErr] = useState("");

  const available = Object.keys(LABELS).filter((a) => {
    if (!staff.permissions.includes(NEEDS[a] ?? "users.moderate")) return false;
    if (a === "RESTORE") return status !== "ACTIVE";
    if (a === "SUSPEND") return status === "ACTIVE";
    if (a === "BAN") return status !== "BANNED";
    if (a === "VERIFY") return selfieStatus !== "VERIFIED";
    if (a === "REJECT_VERIFICATION") return selfieStatus === "PENDING";
    return true;
  });

  async function submit() {
    setErr("");
    try {
      await api(`/api/admin/users/${userId}`, { body: { action, reason, reportId, role: action === "SET_ROLE" ? role : undefined } });
      setAction(null);
      setReason("");
      onDone();
    } catch (e: any) { setErr(e.message); }
  }

  if (!available.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {available.map((a) => (
          <button key={a} onClick={() => setAction(a)}
            className={a === "BAN" ? "btn-danger px-4 py-2 text-sm" : a === "SUSPEND" ? "btn-accent px-4 py-2 text-sm" : "btn-outline px-4 py-2 text-sm"}>
            {LABELS[a]}
          </button>
        ))}
      </div>
      <Modal open={!!action} onClose={() => setAction(null)} title={action ? LABELS[action] : ""}>
        {action === "BAN" && <div className="mb-4"><Alert tone="warn">Banning ends all of this person's matches and logs them out. They can't create a new account with the same email.</Alert></div>}
        {action === "SET_ROLE" && (
          <select className="input mb-4" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        )}
        <label className="label" htmlFor="reason">Reason {action === "WARN" || action === "SUSPEND" || action === "REJECT_VERIFICATION" ? "(sent to the member)" : "(internal record)"}</label>
        <textarea id="reason" className="input min-h-24" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        {err && <div className="mt-3"><Alert tone="error">{err}</Alert></div>}
        <button className={action === "BAN" ? "btn-danger mt-4 w-full" : "btn-primary mt-4 w-full"} disabled={reason.trim().length < 3} onClick={submit}>Confirm</button>
      </Modal>
    </>
  );
}
