"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { api, useApi } from "@/lib/client";
import { Alert, Modal, Spinner } from "./ui";

export type Me = {
  user: { id: string; email: string; phone: string | null; dob: string | null; role: string; status: string; emailVerified: boolean; phoneVerified: boolean; selfieStatus: string; planCode: string; planEndsAt: string | null; onboardingStep: number; permissions: string[] };
  profile: any;
  preferences: any;
  answers: Record<string, number>;
  features: { dailyLikes: number; dailyPriorityLikes: number; seeWhoLiked: boolean; advancedFilters: boolean; incognito: boolean; travelMode: boolean; monthlyBoosts: number };
  unreadNotifications: number;
  pendingLegal: { slug: string; title: string; version: number }[];
};

const MeCtx = createContext<{ me: Me; reload: () => Promise<void> } | null>(null);
export const useMe = () => {
  const v = useContext(MeCtx);
  if (!v) throw new Error("useMe outside AppShell");
  return v;
};

const NAV = [
  { href: "/discover", label: "Discover", icon: "M12 3a9 9 0 100 18 9 9 0 000-18zm3.5 5.5l-2 5-5 2 2-5 5-2z" },
  { href: "/likes", label: "Likes", icon: "M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" },
  { href: "/matches", label: "Chats", icon: "M4 5h16v10H8l-4 4V5z" },
  { href: "/notifications", label: "Alerts", icon: "M6 16V11a6 6 0 1112 0v5l2 2H4l2-2zm4 4h4" },
  { href: "/profile", label: "You", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0" },
];

export function AppShell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const { data: me, error, reload } = useApi<Me>("/api/me");
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!me) return;
    if (me.user.permissions.includes("admin.access") && me.user.role !== "USER" && !path.startsWith("/admin")) router.replace("/admin");
    if (me.user.role === "ADVERTISER") router.replace("/ads"); // business accounts have no dating profile
    else if (me.user.onboardingStep < 3 && !path.startsWith("/onboarding")) router.replace("/onboarding");
  }, [me, path, router]);

  if (error) return <div className="mx-auto max-w-md p-6"><Alert tone="error">{error.message}</Alert></div>;
  if (!me) return <Spinner />;

  const content = (
    <MeCtx.Provider value={{ me, reload: async () => { await reload(); } }}>
      {me.user.status === "SUSPENDED" && (
        <div className="bg-rose-wash px-4 py-2.5 text-center text-sm text-rose">
          Your account is suspended while our team reviews it. You can still read messages and settings. <Link href="/notifications" className="underline">See details</Link>
        </div>
      )}
      {children}
      <LegalGate me={me} onAccepted={reload} />
    </MeCtx.Provider>
  );
  if (bare) return content;

  return (
    <div className="min-h-dvh md:flex">
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-mist bg-paper-raised/95 backdrop-blur md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-t-0 md:bg-paper">
        <Link href="/discover" className="hidden px-6 pb-6 pt-7 font-display text-xl font-extrabold md:block">Kinara</Link>
        <ul className="flex h-16 items-center justify-around md:h-auto md:flex-col md:items-stretch md:gap-1 md:px-3">
          {NAV.map((n) => {
            const active = path.startsWith(n.href);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] font-semibold md:flex-row md:gap-3 md:rounded-xl md:px-3 md:py-2.5 md:text-[15px] ${active ? "text-ink md:bg-paper-sunk" : "text-ink-faint hover:text-ink"}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={n.icon} /></svg>
                  {n.label}
                  {n.href === "/notifications" && me.unreadNotifications > 0 && (
                    <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-rose md:static md:ml-auto md:h-auto md:w-auto md:px-2 md:text-xs md:text-white md:rounded-pill">
                      <span className="sr-only md:not-sr-only">{me.unreadNotifications}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="hidden px-6 pt-8 md:block">
          <Link href="/safety-center" className="text-sm font-semibold text-sage hover:underline">Safety Center</Link>
        </div>
      </nav>
      <main className="flex-1 pb-24 md:pb-10">{content}</main>
    </div>
  );
}

function LegalGate({ me, onAccepted }: { me: Me; onAccepted: () => void }) {
  if (!me.pendingLegal.length) return null;
  return (
    <Modal open dismissable={false} onClose={() => {}} title="Please review our policies">
      <p className="text-ink-soft">These have been added or updated since you last accepted them. Accept to keep using Kinara.</p>
      <ul className="my-4 space-y-2">
        {me.pendingLegal.map((d) => (
          <li key={d.slug}><Link href={`/legal/${d.slug}`} target="_blank" className="font-semibold underline">{d.title}</Link> <span className="text-sm text-ink-faint">version {d.version}</span></li>
        ))}
      </ul>
      <button className="btn-primary w-full" onClick={async () => { await api("/api/legal/accept", { method: "POST" }); onAccepted(); }}>
        Accept and continue
      </button>
    </Modal>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4 px-4 pb-4 pt-6 md:px-8 md:pt-10">
      <div>
        <h1 className="text-3xl font-extrabold md:text-4xl">{title}</h1>
        {sub && <p className="mt-1 text-ink-soft">{sub}</p>}
      </div>
      {action}
    </header>
  );
}
