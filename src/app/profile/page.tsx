"use client";
import Link from "next/link";
import { useState } from "react";
import { AppShell, PageHeader, useMe } from "@/components/AppShell";
import { PersonalityForm, PreferencesForm, ProfileForm } from "@/components/forms";
import { Alert, Avatar, Verified } from "@/components/ui";
import { INTENTS } from "@/lib/constants";

function Profile() {
  const { me, reload } = useMe();
  const [saved, setSaved] = useState("");
  const p = me.profile;
  const done = (what: string) => async () => { await reload(); setSaved(`${what} saved.`); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const age = me.user.dob ? Math.floor((Date.now() - new Date(me.user.dob).getTime()) / (365.25 * 86400_000)) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="You" action={<Link href="/settings" className="btn-outline px-4 py-2 text-sm">Settings</Link>} />
      <div className="space-y-10 px-4 md:px-8">
        {saved && <Alert tone="success">{saved}</Alert>}
        {p && (
          <div className="panel flex items-center gap-4 p-5">
            <Avatar id={me.user.id} name={p.firstName} size={72} />
            <div className="flex-1">
              <p className="flex items-center gap-2 font-display text-2xl font-extrabold">{p.firstName}{age ? `, ${age}` : ""} {me.user.selfieStatus === "VERIFIED" && <Verified />}</p>
              <p className="text-ink-soft">{p.city} · {INTENTS[p.intent as keyof typeof INTENTS]}</p>
              <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-pill bg-paper-sunk" aria-label={`Profile ${p.completeness}% complete`}>
                <div className="h-full bg-sage" style={{ width: `${p.completeness}%` }} />
              </div>
              <p className="mt-1 text-xs text-ink-faint">Profile {p.completeness}% complete</p>
            </div>
          </div>
        )}
        <Alert tone="info">Photo upload is coming next — it needs a storage bucket (S3 or Cloudflare R2) and image moderation. Until then everyone shows a colour portrait.</Alert>

        <section id="edit">
          <h2 className="mb-5 text-2xl font-extrabold">Edit profile</h2>
          <ProfileForm initial={p} submitLabel="Save profile" onSaved={done("Profile")} />
        </section>
        <section id="preferences" className="border-t border-mist pt-10">
          <h2 className="mb-5 text-2xl font-extrabold">Who you'd like to meet</h2>
          <PreferencesForm initial={me.preferences} submitLabel="Save preferences" onSaved={done("Preferences")} advanced={me.features.advancedFilters} />
        </section>
        <section id="personality" className="border-t border-mist pt-10">
          <h2 className="mb-2 text-2xl font-extrabold">How you connect</h2>
          <p className="mb-5 text-ink-soft">Private to you. Used only to calculate compatibility.</p>
          <PersonalityForm initial={me.answers} submitLabel="Save answers" onSaved={done("Answers")} />
        </section>
      </div>
    </div>
  );
}

export default function Page() {
  return <AppShell><Profile /></AppShell>;
}
