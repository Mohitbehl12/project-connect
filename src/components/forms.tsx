"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { CITIES, COUNTRIES, GENDERS, INTENTS, INTERESTS, LIFESTYLE, PERSONALITY_QUESTIONS } from "@/lib/constants";
import { Alert, Field, PillPicker, Segmented, Toggle } from "./ui";

const PROMPT_CHOICES = [
  "A perfect first date for me is", "I'm quietly proud of", "The way to my heart is",
  "My friends would describe me as", "Something I'm learning right now", "I'll know it's going well when",
];

const citiesByCountry = Object.entries(CITIES).reduce<Record<string, string[]>>((acc, [city, c]) => {
  (acc[c.country] ??= []).push(city);
  return acc;
}, {});

export function ProfileForm({ initial, submitLabel, onSaved }: { initial?: any; submitLabel: string; onSaved: () => void }) {
  const init = initial ?? {};
  const [f, setF] = useState({
    firstName: init.firstName ?? "", gender: init.gender ?? "", city: init.city ?? "", intent: init.intent ?? "",
    bio: init.bio ?? "", education: init.education ?? "", profession: init.profession ?? "", heightCm: init.heightCm ?? "",
    drinking: init.drinking ?? null, smoking: init.smoking ?? null, food: init.food ?? null, exercise: init.exercise ?? null, pets: init.pets ?? null,
    interests: (init.interests ? String(init.interests).split(",").filter(Boolean) : []) as string[],
    prompts: (init.prompts ? JSON.parse(init.prompts) : []) as { q: string; a: string }[],
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!f.firstName || !f.gender || !f.city || !f.intent) return setErr("Fill in your name, gender, city and what you're looking for.");
    setBusy(true);
    try {
      await api("/api/profile", {
        method: "PUT",
        body: {
          ...f, heightCm: f.heightCm ? Number(f.heightCm) : null, education: f.education || null, profession: f.profession || null,
          prompts: f.prompts.filter((p) => p.q && p.a.trim()),
        },
      });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-8">
      <section className="space-y-5">
        <Field label="First name" hint="This is the only name people see.">
          {(id) => <input id={id} className="input" maxLength={40} value={f.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="given-name" />}
        </Field>
        <div>
          <p className="label">I am a</p>
          <Segmented options={GENDERS} value={f.gender} onChange={(v) => set("gender", v)} />
        </div>
        <Field label="City" hint="Others see your city and a rounded distance — never your exact location.">
          {(id) => (
            <select id={id} className="input" value={f.city} onChange={(e) => set("city", e.target.value)}>
              <option value="">Choose your city</option>
              {Object.entries(citiesByCountry).map(([cc, cities]) => (
                <optgroup key={cc} label={COUNTRIES[cc]?.name ?? cc}>
                  {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              ))}
            </select>
          )}
        </Field>
        <div>
          <p className="label">I'm looking for</p>
          <Segmented options={INTENTS} value={f.intent} onChange={(v) => set("intent", v)} />
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-xl font-bold">In your words</h2>
        <Field label="About you" hint={`${f.bio.length}/500. A few honest sentences beat a list of adjectives.`}>
          {(id) => <textarea id={id} className="input min-h-28" maxLength={500} value={f.bio} onChange={(e) => set("bio", e.target.value)} />}
        </Field>
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
            <select aria-label={`Prompt ${i + 1}`} className="input" value={f.prompts[i]?.q ?? ""}
              onChange={(e) => { const p = [...f.prompts]; p[i] = { q: e.target.value, a: p[i]?.a ?? "" }; set("prompts", p); }}>
              <option value="">Pick a prompt (optional)</option>
              {PROMPT_CHOICES.map((q) => <option key={q}>{q}</option>)}
            </select>
            <input aria-label={`Answer ${i + 1}`} className="input" maxLength={200} placeholder="Your answer" disabled={!f.prompts[i]?.q}
              value={f.prompts[i]?.a ?? ""} onChange={(e) => { const p = [...f.prompts]; p[i] = { ...p[i], a: e.target.value }; set("prompts", p); }} />
          </div>
        ))}
      </section>

      <section className="space-y-5">
        <h2 className="text-xl font-bold">Interests</h2>
        <PillPicker options={INTERESTS} value={f.interests} onChange={(v) => set("interests", v)} max={10} />
        <p className="text-sm text-ink-faint">{f.interests.length}/10 chosen. Shared interests power conversation starters.</p>
      </section>

      <section className="space-y-5">
        <h2 className="text-xl font-bold">The basics</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Work">{(id) => <input id={id} className="input" maxLength={80} value={f.profession} onChange={(e) => set("profession", e.target.value)} />}</Field>
          <Field label="Education">{(id) => <input id={id} className="input" maxLength={80} value={f.education} onChange={(e) => set("education", e.target.value)} />}</Field>
          <Field label="Height (cm)">{(id) => <input id={id} className="input" type="number" min={120} max={230} value={f.heightCm} onChange={(e) => set("heightCm", e.target.value)} />}</Field>
        </div>
        {(Object.keys(LIFESTYLE) as (keyof typeof LIFESTYLE)[]).map((k) => (
          <div key={k}>
            <p className="label capitalize">{k}</p>
            <Segmented options={LIFESTYLE[k]} value={(f as any)[k]} onChange={(v) => set(k, v)} />
          </div>
        ))}
      </section>

      {err && <Alert tone="error">{err}</Alert>}
      <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
    </form>
  );
}

export function PreferencesForm({ initial, submitLabel, onSaved, advanced }: { initial?: any; submitLabel: string; onSaved: () => void; advanced: boolean }) {
  const init = initial ?? {};
  const [f, setF] = useState({
    interestedIn: init.interestedIn ? String(init.interestedIn).split(",").filter(Boolean) : [] as string[],
    ageMin: init.ageMin ?? 22, ageMax: init.ageMax ?? 35, maxDistanceKm: init.maxDistanceKm ?? 40,
    intents: init.intents ? String(init.intents).split(",").filter(Boolean) : [] as string[],
    longDistance: !!init.longDistance,
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.interestedIn.length) return setErr("Choose who you'd like to meet.");
    setBusy(true);
    setErr("");
    try {
      await api("/api/preferences", { method: "PUT", body: { ...f, ageMin: Number(f.ageMin), ageMax: Number(f.ageMax), maxDistanceKm: Number(f.maxDistanceKm) } });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-7">
      <div>
        <p className="label">Show me</p>
        <PillPicker options={GENDERS} value={f.interestedIn} onChange={(v) => setF({ ...f, interestedIn: v })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Youngest">{(id) => <input id={id} className="input" type="number" min={18} max={99} value={f.ageMin} onChange={(e) => setF({ ...f, ageMin: e.target.value as any })} />}</Field>
        <Field label="Oldest">{(id) => <input id={id} className="input" type="number" min={18} max={99} value={f.ageMax} onChange={(e) => setF({ ...f, ageMax: e.target.value as any })} />}</Field>
      </div>
      <Field label={`Within ${f.maxDistanceKm} km`}>
        {(id) => <input id={id} type="range" min={2} max={300} value={f.maxDistanceKm} onChange={(e) => setF({ ...f, maxDistanceKm: Number(e.target.value) })} className="w-full accent-ink" />}
      </Field>
      <Toggle label="Open to long distance" description="Also show people beyond your distance and in other countries who are open to it." checked={f.longDistance} onChange={(v) => setF({ ...f, longDistance: v })} />
      <div>
        <p className="label">Only show people looking for…</p>
        <p className="mb-2 text-sm text-ink-faint">Leave empty to see everyone. {advanced ? "" : "Free plans can filter by intent; more filters come with Premium."}</p>
        <PillPicker options={INTENTS} value={f.intents} onChange={(v) => setF({ ...f, intents: v })} />
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
    </form>
  );
}

export function PersonalityForm({ initial, submitLabel, onSaved }: { initial?: Record<string, number>; submitLabel: string; onSaved: () => void }) {
  const [a, setA] = useState<Record<string, number>>(initial ?? {});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const answered = Object.keys(a).length;

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await api("/api/personality", { method: "PUT", body: { answers: a } });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {PERSONALITY_QUESTIONS.map((q) => (
        <fieldset key={q.key} className="panel p-5">
          <legend className="sr-only">{q.prompt}</legend>
          <p className="font-display text-lg font-bold">{q.prompt}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="w-24 text-right text-sm text-ink-soft sm:w-32">{q.left}</span>
            <div className="flex flex-1 justify-between" role="radiogroup" aria-label={q.prompt}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} type="button" role="radio" aria-checked={a[q.key] === v} aria-label={`${v} of 5`}
                  onClick={() => setA({ ...a, [q.key]: v })}
                  className={`h-9 w-9 rounded-full border-2 transition-colors ${a[q.key] === v ? "border-ink bg-ink" : "border-mist bg-paper-raised hover:border-ink-faint"}`} />
              ))}
            </div>
            <span className="w-24 text-sm text-ink-soft sm:w-32">{q.right}</span>
          </div>
        </fieldset>
      ))}
      {err && <Alert tone="error">{err}</Alert>}
      <div className="flex items-center gap-4">
        <button className="btn-primary" disabled={busy || answered < 6} onClick={save}>{busy ? "Saving…" : submitLabel}</button>
        <span className="text-sm text-ink-faint">{answered}/{PERSONALITY_QUESTIONS.length} answered{answered < 6 ? " · answer at least 6" : ""}</span>
      </div>
    </div>
  );
}
