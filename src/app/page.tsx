import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { CompatRing } from "@/components/CompatRing";

const SAMPLE_REASONS = [
  "Looking for the same kind of relationship",
  "You both enjoy trekking, coffee and board games",
  "Handle disagreements the same way",
  "Both in Bengaluru",
];

export default function Landing() {
  return (
    <PublicShell>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-8 md:grid-cols-[1.15fr_1fr] md:px-8 md:pt-16">
        <div>
          <h1 className="text-[44px] font-extrabold leading-[1.02] sm:text-6xl md:text-7xl">
            Know why before you say hello.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-ink-soft">
            Every profile on Project Connect comes with a compatibility score and the reasons behind it — shared goals,
            the way you both handle a disagreement, the city you both call home. Fewer, better matches.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn-accent px-7 py-3 text-base">Create your profile</Link>
            <Link href="/about" className="btn-outline px-7 py-3 text-base">See how matching works</Link>
          </div>
          <p className="mt-6 text-sm text-ink-faint">Free to join. Available in India, the UK, US, UAE, Singapore and more.</p>
        </div>

        {/* A real rendering of the in-app compatibility panel, with sample data. */}
        <div className="relative">
          <div className="panel rotate-[1.5deg] p-6 shadow-[0_24px_60px_-30px_rgba(28,27,58,0.45)]">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-marigold to-rose font-display text-2xl font-bold text-white" aria-hidden>M</div>
              <div>
                <p className="font-display text-2xl font-extrabold">Meera, 29</p>
                <p className="text-ink-soft">Bengaluru · About 5 km away</p>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-4 rounded-xl bg-paper p-4">
              <CompatRing score={87} size={80} />
              <ul className="space-y-1 text-[15px]">
                {SAMPLE_REASONS.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-sage">✓</span>{r}</li>)}
              </ul>
            </div>
            <div className="mt-5 border-l-[3px] border-marigold pl-4">
              <p className="text-sm font-semibold text-ink-faint">A perfect first date for me is</p>
              <p className="font-display text-xl font-bold">a long walk ending at a chai stall</p>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-ink-faint">Sample profile</p>
        </div>
      </section>

      <section className="border-y border-mist bg-paper-raised">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-3 md:px-8">
          <div>
            <h2 className="text-2xl font-extrabold">Intent up front</h2>
            <p className="mt-2 text-ink-soft">Marriage-minded, long-term, or still figuring it out — everyone says so on their profile, and you can filter by it for free.</p>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold">Verified people</h2>
            <p className="mt-2 text-ink-soft">Selfie verification earns a badge. Your phone, email and exact location are never shown to anyone.</p>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold">Conversations, not floods</h2>
            <p className="mt-2 text-ink-soft">You can only message mutual matches, and nobody can send message after message without a reply.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-20 text-center md:px-8">
        <h2 className="text-4xl font-extrabold md:text-5xl">Safety is a feature, not a footnote.</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
          Messages are screened for scams. Reporting takes two taps and blocks the person instantly. First dates are planned for public places.
        </p>
        <Link href="/safety" className="btn-outline mt-8">Read our safety approach</Link>
      </section>
    </PublicShell>
  );
}
