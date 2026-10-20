"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell, useMe } from "@/components/AppShell";
import { PersonalityForm, PreferencesForm, ProfileForm } from "@/components/forms";
import { Alert } from "@/components/ui";
import { api } from "@/lib/client";

const STEPS = ["Your profile", "Who you'd like to meet", "How you connect"];

function Onboarding() {
  const { me, reload } = useMe();
  const router = useRouter();
  const step = Math.min(me.user.onboardingStep, 2);
  const next = async () => {
    await reload();
    if (step === 2) router.push("/discover");
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="font-display text-lg font-extrabold">Kinara</p>
      <ol className="mt-6 flex gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <div className={`h-1.5 rounded-pill ${i <= step ? "bg-ink" : "bg-mist"}`} />
            <p className={`mt-2 text-xs font-semibold sm:text-sm ${i === step ? "text-ink" : "text-ink-faint"}`}>{s}</p>
          </li>
        ))}
      </ol>

      {!me.user.emailVerified && <EmailVerify onDone={reload} />}

      <h1 className="mb-2 mt-8 text-4xl font-extrabold">{STEPS[step]}</h1>
      {step === 0 && (
        <>
          <p className="mb-8 text-ink-soft">Lead with who you are. Photos come next — for now everyone gets a colour portrait.</p>
          <ProfileForm initial={me.profile} submitLabel="Save and continue" onSaved={next} />
        </>
      )}
      {step === 1 && (
        <>
          <p className="mb-8 text-ink-soft">We only show you people who'd also want to see you.</p>
          <PreferencesForm initial={me.preferences} submitLabel="Save and continue" onSaved={next} advanced={me.features.advancedFilters} />
        </>
      )}
      {step === 2 && (
        <>
          <p className="mb-8 text-ink-soft">No right answers. These shape your compatibility scores and are never shown on your profile.</p>
          <PersonalityForm initial={me.answers} submitLabel="Finish and start discovering" onSaved={next} />
        </>
      )}
    </div>
  );
}

function EmailVerify({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  async function send() {
    try {
      const r = await api("/api/auth/otp", { body: { action: "send", channel: "EMAIL" } });
      setMsg({ tone: "info", text: r.devOtp ? `Code sent. Test mode code: ${r.devOtp}` : "We've emailed you a new code." });
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  async function verify() {
    try {
      await api("/api/auth/otp", { body: { action: "verify", channel: "EMAIL", code } });
      onDone();
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  }
  return (
    <div className="panel mt-6 p-5">
      <p className="font-semibold">Confirm your email</p>
      <p className="text-sm text-ink-soft">Enter the 6-digit code we sent you.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className="input w-40 tracking-[0.3em]" inputMode="numeric" maxLength={6} aria-label="Email code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        <button className="btn-primary" onClick={verify} disabled={code.length !== 6}>Confirm</button>
        <button className="btn-ghost" onClick={send}>Send a new code</button>
      </div>
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
    </div>
  );
}

export default function Page() {
  return <AppShell bare><Onboarding /></AppShell>;
}
