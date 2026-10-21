"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, useApi } from "@/lib/client";
import { Alert, Spinner } from "./ui";

type Staff = { user: { id: string; email: string; role: string; permissions: string[] } };
const StaffCtx = createContext<Staff["user"] | null>(null);
export const useStaff = () => useContext(StaffCtx)!;

const NAV: [string, string, string][] = [
  ["/admin", "Dashboard", "analytics.view"],
  ["/admin/reports", "Reports", "reports.view"],
  ["/admin/appeals", "Appeals", "reports.resolve"],
  ["/admin/grievances", "Complaints", "grievances.handle"],
  ["/admin/verification", "Verification", "users.verify"],
  ["/admin/photos", "Photo review", "users.moderate"],
  ["/admin/users", "Users", "users.view"],
  ["/admin/matches", "Matches", "users.view"],
  ["/admin/calls", "Calls", "users.view"],
  ["/admin/payments", "Payments", "payments.view"],
  ["/admin/offers", "Offers & coupons", "offers.edit"],
  ["/admin/risk", "Risk & referrals", "security.view"],
  ["/admin/legal", "Legal", "legal.edit"],
  ["/admin/settings", "Settings & prices", "plans.edit"],
  ["/admin/compliance", "Privacy & compliance", "audit.view"],
  ["/admin/launch", "Launch readiness", "audit.view"],
  ["/admin/audit", "Audit log", "audit.view"],
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { data, error } = useApi<Staff>("/api/me");
  const lock = useApi<StaffLock>("/api/staff/unlock");
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (data && !data.user.permissions.includes("admin.access")) router.replace("/discover");
  }, [data, router]);
  useEffect(() => {
    const relock = () => lock.reload();
    window.addEventListener("staff-locked", relock);
    return () => window.removeEventListener("staff-locked", relock);
  }, [lock]);
  if (error) return <div className="p-6"><Alert tone="error">{error.message}</Alert></div>;
  if (!data || (!lock.data && !lock.error)) return <Spinner />;
  if (!data.user.permissions.includes("admin.access")) return null;
  if (lock.data && (!lock.data.unlocked || (lock.data.mfaRequired && !lock.data.mfaEnabled)))
    return <StaffLockScreen state={lock.data} email={data.user.email} onDone={() => { lock.reload(); router.refresh(); }} />;
  const items = NAV.filter(([, , p]) => data.user.permissions.includes(p));

  return (
    <StaffCtx.Provider value={data.user}>
      <div className="min-h-dvh lg:flex">
        <aside className="border-b border-mist bg-ink text-paper lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-0">
          <div className="flex items-center justify-between px-5 py-4 lg:block lg:py-6">
            <p className="font-display text-lg font-extrabold">Kinara <span className="font-body text-sm font-semibold text-marigold">Admin</span></p>
            <p className="hidden text-xs text-ink-faint lg:mt-1 lg:block">{data.user.email} · {data.user.role.replace("_", " ").toLowerCase()}</p>
          </div>
          <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
            {items.map(([href, label]) => {
              const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
              return (
                <Link key={href} href={href} aria-current={active ? "page" : undefined}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${active ? "bg-paper text-ink" : "text-paper/75 hover:bg-white/10 hover:text-paper"}`}>{label}</Link>
              );
            })}
          </nav>
          <div className="hidden px-6 pt-6 lg:block">
            <button className="text-sm text-paper/70 underline hover:text-paper" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); router.push("/login"); }}>Log out</button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </StaffCtx.Provider>
  );
}

export function AdminTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-extrabold">{title}</h1>
        {sub && <p className="text-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  const tone: Record<string, string> = {
    ACTIVE: "bg-sage-wash text-sage", VERIFIED: "bg-sage-wash text-sage", ACTIONED: "bg-sage-wash text-sage", PUBLISHED: "bg-sage-wash text-sage",
    SUSPENDED: "bg-marigold-wash text-marigold-deep", PENDING: "bg-marigold-wash text-marigold-deep", IN_REVIEW: "bg-marigold-wash text-marigold-deep", HIGH: "bg-marigold-wash text-marigold-deep", OPEN: "bg-marigold-wash text-marigold-deep",
    BANNED: "bg-rose-wash text-rose", CRITICAL: "bg-rose text-white", REJECTED: "bg-rose-wash text-rose", UNMATCHED: "bg-paper-sunk text-ink-faint",
  };
  return <span className={`inline-block rounded-pill px-2 py-0.5 text-xs font-semibold ${tone[value] ?? "bg-paper-sunk text-ink-soft"}`}>{value.replace("_", " ").toLowerCase()}</span>;
}

type StaffLock = { mfaEnabled: boolean; mfaRequired: boolean; unlocked: boolean; idleMinutes: number };

/** 2-step setup (first time) and the unlock prompt after inactivity. */
function StaffLockScreen({ state, email, onDone }: { state: StaffLock; email: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const needSetup = state.mfaRequired && !state.mfaEnabled;
  async function run(fn: () => Promise<unknown>) { setBusy(true); setErr(""); try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <p className="font-display text-lg font-extrabold">Kinara <span className="font-body text-sm font-semibold text-marigold">Admin</span></p>
      {needSetup ? (
        <div className="panel mt-6 space-y-4 p-6">
          <h1 className="text-2xl font-extrabold">Turn on 2-step verification</h1>
          <p className="text-ink-soft">Staff accounts can see private information, so admin tools need a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) as well as your password.</p>
          {!setup ? (
            <button className="btn-primary w-full" disabled={busy} onClick={() => run(async () => setSetup(await api("/api/security/totp", { body: { action: "start" } })))}>Set up 2-step verification</button>
          ) : (
            <>
              <p className="text-sm">In your authenticator app, add an account with this key (or open the link on your phone):</p>
              <p className="break-all rounded-lg bg-paper-sunk p-3 font-mono text-sm">{setup.secret}</p>
              <a className="text-sm underline" href={setup.otpauthUrl}>Open in authenticator app</a>
              <label className="label" htmlFor="c1">6-digit code from the app</label>
              <input id="c1" className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <button className="btn-primary w-full" disabled={busy || code.length < 6} onClick={() => run(async () => {
                await api("/api/security/totp", { body: { action: "confirm", code } });
                setCode(""); onDone();
              })}>Turn on</button>
            </>
          )}
        </div>
      ) : (
        <form className="panel mt-6 space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("/api/staff/unlock", { body: state.mfaEnabled ? { code } : { password } }); onDone(); }); }}>
          <h1 className="text-2xl font-extrabold">Admin tools are locked</h1>
          <p className="text-ink-soft">For safety, admin tools lock after {state.idleMinutes} minutes without activity. Signed in as {email}.</p>
          {state.mfaEnabled ? (
            <>
              <label className="label" htmlFor="c2">6-digit code from your authenticator app</label>
              <input id="c2" className="input" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </>
          ) : (
            <>
              <Alert tone="warn">Test mode: 2-step verification is optional on this server (ADMIN_MFA_OPTIONAL). Never use this setting in production.</Alert>
              <label className="label" htmlFor="pw">Password</label>
              <input id="pw" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </>
          )}
          <button className="btn-primary w-full" disabled={busy}>Unlock</button>
        </form>
      )}
      {err && <div className="mt-4"><Alert tone="error">{err}</Alert></div>}
    </div>
  );
}
