"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Alert, Spinner } from "@/components/ui";
import { api, useApi } from "@/lib/client";

export type Campaign = {
  id: string; name: string; objective: string; status: string; placements: string[]; pricing: string;
  dailyBudgetMinor: number; totalBudgetMinor: number; spentMinor: number; remainingMinor: number | null;
  startAt: string | null; endAt: string | null; rejection: string | null; submittedAt: string | null; createdAt: string; conversionKey: string;
  targeting: { countries: string[]; regions: string[]; cities: string[]; ageMin: number; ageMax: number; genders: string[]; interests: string[]; devices: string[]; languages: string[] };
  creative: { headline: string; description: string; cta: string; url: string; logoKey: string | null; imageKeys: string[]; videoKey: string | null };
};
export type Totals = { impressions: number; reach: number; clicks: number; conversions: number; videoViews: number; hides: number; spendMinor: number; ctr: number; cpcMinor: number; cpaMinor: number };
export type Account = {
  advertiser: { id: string; businessName: string; contactName: string; email: string; phone: string; category: string; categoryLabel: string; website: string | null; address: string | null; gstin: string | null; verification: string; status: string; balanceMinor: number };
  counts: Record<string, number>;
  stats: { totals: Totals; daily: { day: string; impressions: number; clicks: number; spend: number }[] };
  campaigns: Campaign[];
};

const Ctx = createContext<{ account: Account; reload: () => void } | null>(null);
export const useAccount = () => useContext(Ctx)!;

const NAV = [["/ads", "Dashboard"], ["/ads/new", "+ Create Advertisement"], ["/ads/billing", "Billing"], ["/ads/account", "Business details"]] as const;

export const STATUS_LABEL: Record<string, [string, string]> = {
  DRAFT: ["Draft", "bg-paper-sunk text-ink-soft"], PENDING_REVIEW: ["Pending review", "bg-marigold-wash text-ink"], APPROVED: ["Scheduled", "bg-sage-wash text-sage"],
  REJECTED: ["Rejected", "bg-rose-wash text-rose"], ACTIVE: ["Active", "bg-sage text-white"], PAUSED: ["Paused", "bg-paper-sunk text-ink"], COMPLETED: ["Completed", "bg-ink text-paper"],
};
export function CampaignStatus({ value }: { value: string }) {
  const [label, cls] = STATUS_LABEL[value] ?? [value, "bg-paper-sunk"];
  return <span className={`inline-block rounded-pill px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
export const VERIFICATION: Record<string, string> = { UNVERIFIED: "Unverified", VERIFIED: "Verified business", TRUSTED: "Trusted advertiser" };

export function AdsShell({ children }: { children: ReactNode }) {
  const q = useApi<Account>("/api/ads/account");
  const me = useApi<{ user: { email: string; emailVerified: boolean } }>("/api/me");
  const path = usePathname();
  if (q.error?.code === "not_advertiser" || q.error?.code === "forbidden")
    return <div className="mx-auto max-w-lg p-8"><Alert tone="info">This area is for business accounts. <Link className="font-semibold underline" href="/advertise">Create an advertiser account</Link> with a separate email.</Alert></div>;
  if (q.error) return <div className="mx-auto max-w-lg p-8"><Alert tone="error">{q.error.message}</Alert></div>;
  if (!q.data) return <Spinner />;
  const a = q.data.advertiser;
  return (
    <Ctx.Provider value={{ account: q.data, reload: q.reload }}>
      <div className="min-h-dvh bg-paper">
        <header className="border-b border-mist bg-paper-raised">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-8">
            <Link href="/ads" className="flex items-center gap-2 font-display text-lg font-extrabold">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kinara-mark.png" alt="" width={26} height={26} className="rounded-md" />Kinara <span className="font-body text-sm font-semibold text-[#A5781F]">Ads</span>
            </Link>
            <nav aria-label="Advertiser" className="flex flex-1 flex-wrap gap-1">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
                  className={`rounded-pill px-3 py-1.5 text-sm font-semibold ${href === "/ads/new" ? "bg-berry text-white hover:bg-berry-deep" : path === href ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-sunk"}`}>{label}</Link>
              ))}
            </nav>
            <div className="text-right text-sm">
              <p className="font-semibold">{a.businessName}</p>
              <p className="text-ink-faint">{VERIFICATION[a.verification]} · <button className="underline" onClick={async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); window.location.href = "/advertise"; }}>Log out</button></p>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
          {a.status === "SUSPENDED" && <div className="mb-4"><Alert tone="error">Your advertiser account is suspended and your campaigns are paused. Check your email, or <Link href="/appeal" className="underline">appeal the decision</Link>.</Alert></div>}
          {me.data && !me.data.user.emailVerified && <VerifyEmail onDone={me.reload} />}
          {a.verification === "UNVERIFIED" && a.status === "ACTIVE" && (
            <div className="mb-4"><Alert tone="warn">We verify every business before its ads can go live. Our team checks your details when you submit your first ad — have your GST certificate or business registration ready in case we ask.</Alert></div>
          )}
          {children}
        </main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-sm text-ink-faint md:px-8">
          <Link href="/legal/advertising" className="underline">Advertising Terms and Policy</Link> · <Link href="/legal/privacy" className="underline">Privacy Policy</Link> · Members' personal data is never shared with advertisers.
        </footer>
      </div>
    </Ctx.Provider>
  );
}

function VerifyEmail({ onDone }: { onDone: () => void }) {
  const [err, setErr] = useState("");
  return (
    <div className="mb-4 rounded-xl bg-marigold-wash px-4 py-3 text-sm">
      <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get("code") ?? "");
        try { await api("/api/auth/otp", { body: { action: "verify", channel: "EMAIL", code } }); onDone(); } catch (x: any) { setErr(x.message); }
      }}>
        <span>Confirm your email: enter the 6-digit code we sent.</span>
        <input name="code" inputMode="numeric" maxLength={6} className="input max-w-32 py-1.5" aria-label="Email code" />
        <button className="btn-primary px-3 py-1.5 text-sm">Confirm</button>
        <button type="button" className="underline" onClick={() => api("/api/auth/otp", { body: { action: "send", channel: "EMAIL" } }).catch(() => {})}>Send a new code</button>
      </form>
      {err && <p className="mt-1 text-rose" role="alert">{err}</p>}
    </div>
  );
}
