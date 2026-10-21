import { PublicShell } from "@/components/PublicShell";
import { APPEAL_KINDS } from "@/lib/appeals";
import { AppealForm } from "./AppealForm";

export const metadata = { title: "Appeal a decision" };
export const dynamic = "force-dynamic";

export default function Appeal() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-4xl font-extrabold">Appeal a decision</h1>
        <p className="mt-3 text-ink-soft">
          If we suspended or banned your account, paused features, removed a photo or made an automated decision you think is wrong,
          tell us here. A member of our team who wasn&apos;t involved in the original decision reviews every appeal. You get a case number straight away.
        </p>
        <div className="mt-8"><AppealForm kinds={{ ...APPEAL_KINDS }} /></div>
      </div>
    </PublicShell>
  );
}
