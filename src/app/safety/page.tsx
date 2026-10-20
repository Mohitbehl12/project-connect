import { PublicShell } from "@/components/PublicShell";
import { SafetyContent } from "@/components/SafetyContent";

export const metadata = { title: "Safety" };

export default function Safety() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-4xl px-4 py-12 md:px-8">
        <h1 className="text-5xl font-extrabold">Safety on Kinara</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">Meeting new people should feel exciting, not risky. Here's how we help, and what you can do.</p>
        <div className="mt-12"><SafetyContent /></div>
      </div>
    </PublicShell>
  );
}
