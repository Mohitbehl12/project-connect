"use client";
import Link from "next/link";
import { useState } from "react";
import { PublicShell } from "@/components/PublicShell";
import { Alert, Field } from "@/components/ui";
import { api } from "@/lib/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ message: string; devResetUrl?: string } | null>(null);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { setDone(await api("/api/auth/forgot", { body: { email } })); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <PublicShell>
      <div className="mx-auto max-w-sm px-4 py-12">
        <h1 className="text-4xl font-extrabold">Forgot your password?</h1>
        <p className="mt-3 text-ink-soft">Enter the email you signed up with. We&apos;ll send a link to choose a new password.</p>
        {done ? (
          <div className="mt-8 space-y-4">
            <Alert tone="success">{done.message}</Alert>
            <p className="text-sm text-ink-soft">Can&apos;t find it? Check your spam folder, or try again in a few minutes.</p>
            {done.devResetUrl && <Alert tone="warn">Test mode: <a className="font-semibold underline" href={done.devResetUrl}>open the reset link</a> (email isn&apos;t set up).</Alert>}
            <Link href="/login" className="btn-outline w-full py-3">Back to log in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <Field label="Email">{(id) => <input id={id} type="email" className="input" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
            {err && <Alert tone="error">{err}</Alert>}
            <button className="btn-primary w-full py-3" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
            <p className="text-center text-sm"><Link href="/login" className="font-semibold underline">Back to log in</Link></p>
          </form>
        )}
      </div>
    </PublicShell>
  );
}
