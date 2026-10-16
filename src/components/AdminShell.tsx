"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { api, useApi } from "@/lib/client";
import { Alert, Spinner } from "./ui";

type Staff = { user: { id: string; email: string; role: string; permissions: string[] } };
const StaffCtx = createContext<Staff["user"] | null>(null);
export const useStaff = () => useContext(StaffCtx)!;

const NAV: [string, string, string][] = [
  ["/admin", "Dashboard", "analytics.view"],
  ["/admin/reports", "Reports", "reports.view"],
  ["/admin/grievances", "Complaints", "grievances.handle"],
  ["/admin/verification", "Verification", "users.verify"],
  ["/admin/users", "Users", "users.view"],
  ["/admin/matches", "Matches", "users.view"],
  ["/admin/payments", "Payments", "payments.view"],
  ["/admin/offers", "Offers & coupons", "offers.edit"],
  ["/admin/risk", "Risk & referrals", "security.view"],
  ["/admin/legal", "Legal", "legal.edit"],
  ["/admin/settings", "Settings & prices", "plans.edit"],
  ["/admin/audit", "Audit log", "audit.view"],
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { data, error } = useApi<Staff>("/api/me");
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (data && !data.user.permissions.includes("admin.access")) router.replace("/discover");
  }, [data, router]);
  if (error) return <div className="p-6"><Alert tone="error">{error.message}</Alert></div>;
  if (!data) return <Spinner />;
  if (!data.user.permissions.includes("admin.access")) return null;
  const items = NAV.filter(([, , p]) => data.user.permissions.includes(p));

  return (
    <StaffCtx.Provider value={data.user}>
      <div className="min-h-dvh lg:flex">
        <aside className="border-b border-mist bg-ink text-paper lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-0">
          <div className="flex items-center justify-between px-5 py-4 lg:block lg:py-6">
            <p className="font-display text-lg font-extrabold">Project Connect <span className="font-body text-sm font-semibold text-marigold">Admin</span></p>
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
