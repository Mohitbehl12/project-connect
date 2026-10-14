"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PublicShell } from "@/components/PublicShell";
import { Alert, Field } from "@/components/ui";
import { api } from "@/lib/client";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [valid, setValid] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => { api<{ valid: boolean }>(`/api/auth/reset?token=${encodeURIComponent(token)}`).then((r) => setValid(r.valid)).catch(() => setValid(false)); }, [token]);
  const strong = pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { setErr("The two passwords don't match."); return; }
    setBusy(true); setErr("");
    try { await api("/api/auth/reset", { body: { token, password: pw } }); setDone(true); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (valid === null) return <p className="mt-8 text-ink-soft">Checking your link…</p>;
  if (done) return (
    <div className="mt-8 space-y-4">
      <Alert tone="success">Your password has been changed. For your security, every device was signed out.</Alert>
      <Link href="/login" className="btn-primary w-full py-3">Log in</Link>
      <p className="text-center text-sm text-ink-soft">Using the phone app? Open it and sign in with your new password.</p>
    </div>
  );
  if (!valid) return (
    <div className="mt-8 space-y-4">
      <Alert tone="error">This link has expired or was already used. Links work once, for 30 minutes.</Alert>
      <Link href="/forgot-password" className="btn-primary w-full py-3">Send a new link</Link>
    </div>
  );
  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <Field label="New password" hint="At least 8 characters, including a letter and a number." error={pw && !strong ? "Add a letter and a number, 8 characters or more." : undefined}>
        {(id) => <input id={id} type="password" className="input" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />}
      </Field>
      <Field label="Type it again">{(id) => <input id={id} type="password" className="input" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
      {err && <Alert tone="error">{err}</Alert>}
      <button className="btn-primary w-full py-3" disabled={busy || !strong}>{busy ? "Saving…" : "Set new password"}</button>
    </form>
  );
}

export default function ResetPassword() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-sm px-4 py-12">
        <h1 className="text-4xl font-extrabold">Choose a new password</h1>
        <Suspense><ResetForm /></Suspense>
      </div>
    </PublicShell>
  );
}
