"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PublicShell } from "@/components/PublicShell";
import { Alert, Field } from "@/components/ui";
import { api } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ next: string }>("/api/auth/login", { body: { email, password, totp: needCode ? code : undefined } });
      const back = params.get("next");
      // Only same-site paths: "/\evil.com" and "//evil.com" resolve to another origin and are refused.
      let dest = r.next;
      if (back) {
        try { const u = new URL(back, window.location.origin); if (u.origin === window.location.origin && back.startsWith("/")) dest = u.pathname + u.search; } catch { /* ignore */ }
      }
      router.push(dest);
    } catch (e: any) {
      if (e.code === "totp_required") { setNeedCode(true); setBusy(false); return; }
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Email">{(id) => <input id={id} type="email" className="input" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      <Field label="Password">{(id) => <input id={id} type="password" className="input" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
      <p className="-mt-2 text-right text-sm"><Link href="/forgot-password" className="font-semibold text-ink underline">Forgot password?</Link></p>
      {needCode && (
        <Field label="6-digit code from your authenticator app">{(id) => <input id={id} inputMode="numeric" autoComplete="one-time-code" className="input" required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />}</Field>
      )}
      {err && <Alert tone="error">{err}</Alert>}
      <button className="btn-primary w-full py-3" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
    </form>
  );
}

export default function Login() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-sm px-4 py-12">
        <h1 className="text-4xl font-extrabold">Welcome back</h1>
        <div className="mt-8"><Suspense><LoginForm /></Suspense></div>
        <p className="mt-6 text-center text-ink-soft">New here? <Link href="/register" className="font-semibold text-ink underline">Create a profile</Link></p>
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-10 rounded-xl bg-paper-sunk p-4 text-sm text-ink-soft">
            <p className="font-semibold text-ink">Test accounts (local development only)</p>
            <p className="mt-1">aanya@demo.local or rohan@demo.local · password <code>Demo!2026</code></p>
            <p>Admin: admin@projectconnect.local · password from <code>SEED_ADMIN_PASSWORD</code></p>
          </div>
        )}
      </div>
    </PublicShell>
  );
}
