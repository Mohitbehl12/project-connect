import { PublicShell } from "@/components/PublicShell";

export const metadata = { title: "How it works" };

const STEPS = [
  ["Make a profile that sounds like you", "Your name, city and what you're looking for, plus a bio and up to three prompts. Interests and lifestyle help us find common ground."],
  ["Answer ten quick questions", "How you spend a free evening, how you handle a disagreement, how fast you like things to move. Your answers are private — only the compatibility they produce is shown."],
  ["Discover with reasons", "Browse by best fit, nearby, shared interests or same goals. Each person shows a compatibility score and the specific things you have in common."],
  ["Like, or like with a note", "A match happens only when you both say yes. Priority likes let you add a short note that lands at the top of their list."],
  ["Talk, then plan something public", "Chat with conversation starters drawn from what you share, then use the date planner to suggest a café, a walk or an activity."],
];

export default function About() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:px-8">
        <h1 className="text-5xl font-extrabold">How Kinara works</h1>
        <ol className="mt-12 space-y-10">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="grid grid-cols-[3rem_1fr] gap-4">
              <span className="font-display text-4xl font-extrabold text-marigold">{i + 1}</span>
              <div>
                <h2 className="text-2xl font-bold">{t}</h2>
                <p className="mt-2 text-lg text-ink-soft">{b}</p>
              </div>
            </li>
          ))}
        </ol>
        <section className="panel mt-16 p-6">
          <h2 className="text-2xl font-bold">What goes into a compatibility score</h2>
          <p className="mt-2 text-ink-soft">
            Relationship goals carry the most weight, followed by personality, shared interests and lifestyle. Distance, age fit and
            profile quality round it out. We never show 100% — no score can promise chemistry — and we never use photos, religion,
            caste or ethnicity to rank people.
          </p>
        </section>
      </div>
    </PublicShell>
  );
}
