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
      <section className="kn-hero relative overflow-hidden text-white">
        {/* Slow floating hearts and sparkles (decorative; off with reduced motion). */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {["❤️", "✨", "💕", "💖", "✨", "😉", "❤️", "✨", "💕", "🔥", "✨", "💖"].map((e, i) => (
            <span key={i} className="kn-float" style={{ left: `${(i * 37) % 96}%`, animationDelay: `${i * 1.6}s`, fontSize: `${14 + (i % 4) * 6}px` }}>{e}</span>
          ))}
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 md:grid-cols-[1.15fr_1fr] md:px-8 md:pt-20">
          <div>
            <h1 className="text-[42px] font-extrabold leading-[1.04] text-white sm:text-6xl md:text-[68px]">
              Meet someone who makes your heart skip a beat. <span aria-hidden>❤️</span>
            </h1>
            <p className="mt-6 max-w-lg text-xl text-white/80">Discover. Connect. Flirt. Find your chemistry. <span aria-hidden>🔥</span></p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/register" className="kn-glow rounded-full bg-gradient-to-r from-[#E8467C] to-[#7B2FB0] px-8 py-3.5 text-base font-bold text-white">Start Matching ❤️</Link>
              <Link href="/app" className="rounded-full border border-white/30 px-8 py-3.5 text-base font-bold text-white hover:bg-white/10">Explore Profiles 👀</Link>
            </div>
            <p className="mt-6 text-sm text-white/55">For adults 18+. Women join free for life in India. Verified profiles, and nobody can call you until you say yes.</p>
          </div>

          {/* A real rendering of the in-app compatibility panel, with sample data. */}
          <div className="relative">
            <div className="rotate-[1.5deg] rounded-[28px] border border-white/15 bg-white/[0.07] p-6 shadow-[0_30px_80px_-30px_rgba(232,70,124,0.55)] backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#E8467C] to-[#7B2FB0] font-display text-2xl font-bold text-white" aria-hidden>M</div>
                <div>
                  <p className="font-display text-2xl font-extrabold">Meera, 29</p>
                  <p className="text-white/70">Bengaluru · Within 10 km</p>
                </div>
              </div>
              <p className="mt-4 inline-block rounded-full border border-[#F48FB8]/50 bg-[#E8467C]/25 px-3 py-1 text-sm font-semibold">There might be chemistry here… 🔥</p>
              <div className="mt-4 flex items-center gap-4 rounded-xl bg-black/30 p-4">
                <CompatRing score={87} size={80} />
                <ul className="space-y-1 text-[15px] text-white/90">
                  {SAMPLE_REASONS.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-[#E9C37A]">✓</span>{r}</li>)}
                </ul>
              </div>
              <div className="mt-5 border-l-[3px] border-[#E9C37A] pl-4">
                <p className="text-sm font-semibold text-white/60">A perfect first date for me is</p>
                <p className="font-display text-xl font-bold">a long walk ending at a chai stall</p>
              </div>
              <div className="mt-5 flex justify-center gap-3 text-2xl" aria-hidden>
                <span className="kn-pop flex h-12 w-12 items-center justify-center rounded-full bg-white/10">❌</span>
                <span className="kn-pop flex h-12 w-12 items-center justify-center rounded-full bg-white/10">👀</span>
                <span className="kn-pop kn-glow flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#E8467C] to-[#7B2FB0]">❤️</span>
                <span className="kn-pop flex h-12 w-12 items-center justify-center rounded-full bg-white/10">⭐</span>
                <span className="kn-pop flex h-12 w-12 items-center justify-center rounded-full bg-white/10">✨</span>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-white/50">Sample profile</p>
          </div>
        </div>
      </section>

      <section className="border-y border-mist bg-paper-raised">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 lg:grid-cols-4 md:px-8">
          <div>
            <h2 className="text-2xl font-extrabold">Winks, Sparks & Super Likes 😉</h2>
            <p className="mt-2 text-ink-soft">Say it with a wink, a Spark ✨ or a Super Like ⭐. Match, and the chat comes alive with hearts, reactions and themes like Midnight 🌙 and Rose 🌹.</p>
          </div>
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
