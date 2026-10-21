"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PublicShell } from "@/components/PublicShell";
import { Alert, Field } from "@/components/ui";
import { api } from "@/lib/client";

export default function Register() {
  const router = useRouter();
  const [f, setF] = useState({ email: "", password: "", dob: "" });
  const [checks, setChecks] = useState({ confirmAdult: false, acceptLegal: false, safetyAcknowledged: false });
  const [marketing, setMarketing] = useState(false); // optional, never pre-ticked
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const maxDob = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10); })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!checks.confirmAdult || !checks.acceptLegal || !checks.safetyAcknowledged) return setErr("Tick all three boxes to continue.");
    setBusy(true);
    try {
      await api("/api/auth/register", { body: { ...f, ...checks, marketing } });
      router.push("/onboarding");
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const box = (k: keyof typeof checks, label: React.ReactNode) => (
    <label className="flex gap-3 text-[15px]">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-ink" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );

  return (
    <PublicShell>
      <div className="mx-auto max-w-sm px-4 py-12">
        <h1 className="text-4xl font-extrabold">Create your profile</h1>
        <p className="mt-2 text-ink-soft">Takes about five minutes.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <Field label="Email">{(id) => <input id={id} type="email" className="input" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
          <Field label="Password" hint="At least 8 characters, including a letter and a number.">
            {(id) => <input id={id} type="password" className="input" autoComplete="new-password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}
          </Field>
          <Field label="Date of birth" hint="You must be 18 or older. Your exact birthday is never shown — only your age.">
            {(id) => <input id={id} type="date" className="input" required max={maxDob} value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} />}
          </Field>
          <div className="space-y-3 rounded-xl bg-paper-sunk p-4">
            {box("confirmAdult", "I'm 18 or older.")}
            {box("acceptLegal", <>I agree to the <Link href="/legal/terms" target="_blank" className="underline">Terms</Link>, <Link href="/legal/privacy" target="_blank" className="underline">Privacy Policy</Link> and <Link href="/legal/guidelines" target="_blank" className="underline">Community Guidelines</Link>.</>)}
            {box("safetyAcknowledged", <>I've read the <Link href="/safety" target="_blank" className="underline">safety tips</Link> and will meet new people in public places.</>)}
          </div>
          <label className="flex gap-3 text-[15px]">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-ink" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            <span>Optional: send me news and offers. <span className="text-ink-soft">You can change this any time.</span></span>
          </label>
          {err && <Alert tone="error">{err}</Alert>}
          <button className="btn-primary w-full py-3" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        </form>
        <p className="mt-4 text-center text-xs text-ink-faint">Google and Apple sign-in are planned; they need OAuth keys configured.</p>
        <p className="mt-6 text-center text-ink-soft">Already have an account? <Link href="/login" className="font-semibold text-ink underline">Log in</Link></p>
      </div>
    </PublicShell>
  );
}
