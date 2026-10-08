import Link from "next/link";
import type { ReactNode } from "react";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 md:px-8">
        <Link href="/" className="font-display text-xl font-extrabold">Project Connect</Link>
        <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
          <Link href="/safety" className="btn-ghost hidden px-3 sm:inline-flex">Safety</Link>
          <Link href="/about" className="btn-ghost hidden px-3 sm:inline-flex">How it works</Link>
          <Link href="/login" className="btn-ghost px-3">Log in</Link>
          <Link href="/register" className="btn-primary">Join</Link>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="mt-20 border-t border-mist">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-ink-soft sm:grid-cols-3 md:px-8">
          <div>
            <p className="font-display text-lg font-extrabold text-ink">Project Connect</p>
            <p className="mt-1">Dating built around intent, compatibility and safety. 18+ only.</p>
          </div>
          <ul className="space-y-1.5">
            <li><Link href="/about" className="hover:text-ink">How it works</Link></li>
            <li><Link href="/safety" className="hover:text-ink">Safety</Link></li>
            <li><Link href="/contact" className="hover:text-ink">Contact</Link></li>
          </ul>
          <ul className="space-y-1.5">
            <li><Link href="/legal/terms" className="hover:text-ink">Terms of Service</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-ink">Privacy Policy</Link></li>
            <li><Link href="/legal/guidelines" className="hover:text-ink">Community Guidelines</Link></li>
            <li><Link href="/legal/cookies" className="hover:text-ink">Cookie Policy</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
