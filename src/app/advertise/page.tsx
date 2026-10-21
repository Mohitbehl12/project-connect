import Link from "next/link";
import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";

export const metadata: Metadata = { title: "Advertise on Kinara", description: "Reach adults in your city with clearly labelled, reviewed ads. Advertisers only get aggregated results." };

const STEPS = [
  ["Create your advertisement", "Upload images or a short video, write a headline and choose a button like Shop now or Book now. See a live preview as you go."],
  ["Choose your audience", "Pick countries, states or cities — for example Delhi NCR — plus age range, device and language."],
  ["Set your budget", "Daily and total budgets, from ₹100 a day. Pay per 1,000 views, per click, per action, or book a fixed placement. Pause any time."],
  ["Submit for approval", "Every ad is checked automatically and by a person, and we verify your business before anything goes live."],
  ["Start reaching customers", "Track views, reach, clicks, CTR and conversions in clean charts. Change or stop your campaign whenever you like."],
];

export default function Advertise() {
  return (
    <PublicShell>
      <section className="kn-hero text-white">
        <div className="mx-auto max-w-5xl px-4 pb-20 pt-14 md:px-8 md:pt-20">
          <p className="text-sm font-bold uppercase tracking-widest text-[#E9C37A]">Kinara Ads</p>
          <h1 className="mt-3 max-w-3xl text-[40px] font-extrabold leading-[1.05] text-white sm:text-6xl">Reach People Who Are Ready to Discover Something New.</h1>
          <p className="mt-6 max-w-2xl text-xl text-white/80">Restaurants, salons, fashion, travel, events and local businesses: put your brand in front of adults planning their next date — with ads that are premium, relevant and clearly labelled.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/advertise/register" className="kn-glow rounded-full bg-gradient-to-r from-[#E8467C] to-[#7B2FB0] px-8 py-3.5 text-base font-bold text-white">Start Advertising</Link>
            <Link href="/login?next=/ads" className="rounded-full border border-white/30 px-8 py-3.5 text-base font-bold text-white hover:bg-white/10">Advertiser log in</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 md:px-8">
        <h2 className="text-3xl font-extrabold">How it works</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-5">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="panel p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-berry font-bold text-white">{i + 1}</span>
              <h3 className="mt-3 font-display text-lg font-bold">{t}</h3>
              <p className="mt-1 text-sm text-ink-soft">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-mist bg-paper-raised">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-3 md:px-8">
          <div>
            <h2 className="text-2xl font-extrabold">Where ads appear</h2>
            <p className="mt-2 text-ink-soft">A sponsored card in Discover and Explore, full-screen stories, small banners, sponsored recommendations and the website homepage. Never inside a conversation, and never during a call.</p>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold">Privacy first</h2>
            <p className="mt-2 text-ink-soft">You get totals — views, reach, clicks, conversions, spend. You never get names, photos, phone numbers, emails, locations, messages or dating activity. That's how members can trust the ads they see.</p>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold">Honest numbers</h2>
            <p className="mt-2 text-ink-soft">Estimated reach is a guide, not a promise. We don't guarantee views or sales, and you only pay for what is delivered. Unused balance can be refunded.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center md:px-8">
        <h2 className="text-3xl font-extrabold">Ready when you are.</h2>
        <p className="mt-3 text-ink-soft">Creating an account is free. You only pay when you add balance.</p>
        <Link href="/advertise/register" className="btn-primary mt-6 px-8 py-3">Start Advertising</Link>
        <p className="mt-4 text-sm"><Link href="/legal/advertising" className="underline">Advertising Terms and Policy</Link></p>
      </section>
    </PublicShell>
  );
}
