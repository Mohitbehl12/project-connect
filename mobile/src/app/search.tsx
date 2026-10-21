import { CITIES, INTENTS, INTERESTS, LANGUAGES, LIFESTYLE } from "@shared/constants";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Aurora } from "@/components/Ambient";
import { Icon } from "@/components/Icon";
import { InterestPicker } from "@/components/InterestTile";
import { LuxIcon } from "@/components/LuxIcon";
import { T } from "@/components/Text";
import { Chip, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { alpha } from "@/theme/themes";
import { useTheme } from "@/theme/ThemeProvider";

const LIFE_LABEL: Record<string, string> = { drinking: "Drinking", smoking: "Smoking", food: "Food", exercise: "Exercise", pets: "Pets" };

type F = { q: string; ageMin: number; ageMax: number; city: string; interests: string[]; intents: string[]; languages: string[]; education: string; profession: string; life: Record<string, string[]>; verified: boolean };

/**
 * Full-screen search. Filters only narrow who the viewer could already see — nobody can be found by name, by
 * exact location, or past their own privacy settings, and the result count updates as you go.
 */
// The glowing pill is the focus cue; drop the browser's square focus ring on the web build.
const NO_RING = (Platform.OS === "web" ? { outlineStyle: "none" } : {}) as object;

export default function Search() {
  const { c, g, dark } = useTheme();
  const { me } = useAuth();
  const country = me?.profile?.country ?? "IN";
  const cities = useMemo(() => Object.entries(CITIES).filter(([, v]) => v.country === country).map(([k]) => k), [country]);
  const [f, setF] = useState<F>({ q: "", ageMin: 18, ageMax: 99, city: "", interests: [], intents: [], languages: [], education: "", profession: "", life: {}, verified: false });
  const [count, setCount] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>("interests");
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((s) => ({ ...s, [k]: v }));
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (f.q.trim()) p.set("q", f.q.trim());
    if (f.ageMin > 18) p.set("ageMin", String(f.ageMin));
    if (f.ageMax < 99) p.set("ageMax", String(f.ageMax));
    if (f.city) p.set("city", f.city);
    if (f.interests.length) p.set("interests", f.interests.join(","));
    if (f.intents.length) p.set("intents", f.intents.join(","));
    if (f.languages.length) p.set("languages", f.languages.join(","));
    if (f.education.trim()) p.set("education", f.education.trim());
    if (f.profession.trim()) p.set("profession", f.profession.trim());
    for (const [k, v] of Object.entries(f.life)) if (v.length) p.set(k, v.join(","));
    if (f.verified) p.set("verified", "1");
    return p.toString();
  }, [f]);
  useEffect(() => {
    const h = setTimeout(() => { api<{ totalAvailable: number }>(`/api/discovery?mode=recommended&${qs}`).then((r) => setCount(r.totalAvailable)).catch(() => setCount(null)); }, 350);
    return () => clearTimeout(h);
  }, [qs]);
  const active = { age: f.ageMin > 18 || f.ageMax < 99, location: !!f.city, interests: f.interests.length > 0, lifestyle: Object.values(f.life).some((v) => v.length) || f.verified, languages: f.languages.length > 0, education: !!f.education.trim(), profession: !!f.profession.trim(), relationship: f.intents.length > 0 };
  const toggle = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const field = { ...NO_RING, minHeight: 50, borderRadius: 16, backgroundColor: c.raised, paddingHorizontal: 14, fontSize: 17, color: c.text, fontFamily: "Figtree_500Medium" } as const;

  return (
    <Screen pad={false} edges={["top", "bottom"]}>
      <Aurora variant="top" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close search" hitSlop={10} onPress={() => router.back()} style={{ padding: 8 }}><Icon name="close" /></Pressable>
          <T v="headline" style={{ flex: 1 }}>Search</T>
          <Pressable accessibilityRole="button" onPress={() => { haptic.tick(); setF({ q: "", ageMin: 18, ageMax: 99, city: "", interests: [], intents: [], languages: [], education: "", profession: "", life: {}, verified: false }); }} style={{ padding: 8 }}>
            <T v="callout" strong tone="brand">Clear all</T>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 12, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, borderRadius: 29, paddingHorizontal: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: alpha(c.accent, 0.55), shadowColor: g.sunset[0], shadowOpacity: dark ? 0.3 : 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}>
            <LuxIcon name="search" size={24} active={!!f.q.trim()} color={c.muted} />
            <TextInput value={f.q} onChangeText={(v) => set("q", v)} placeholder="Who are you hoping to discover? ✨" placeholderTextColor={c.faint} autoFocus maxLength={60} returnKeyType="search"
              accessibilityLabel="Who are you hoping to discover?" style={[{ flex: 1, fontSize: 17, color: c.text, fontFamily: "Figtree_500Medium", paddingVertical: 12 }, NO_RING]} />
          </View>
          <T v="caption" tone="faint">Try “photographer”, “yoga”, “Pune” or “marriage”. Searches work, interests, bio and city — never names.</T>

          <Section id="age" icon="age" title="Age" value={active.age ? `${f.ageMin}–${f.ageMax}` : "Any (within your preferences)"} active={active.age} open={open} setOpen={setOpen}>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <Stepper label="From" value={f.ageMin} min={18} max={f.ageMax} onChange={(v) => set("ageMin", v)} />
              <Stepper label="To" value={f.ageMax} min={f.ageMin} max={99} onChange={(v) => set("ageMax", v)} />
            </View>
          </Section>
          <Section id="location" icon="location" title="Location" value={f.city || "Anywhere you can already see"} active={active.location} open={open} setOpen={setOpen}>
            <Chips>{cities.map((k) => <Chip key={k} small label={k} selected={f.city === k} onPress={() => set("city", f.city === k ? "" : k)} />)}</Chips>
            <T v="caption" tone="faint">City only — Kinara never uses exact locations.</T>
          </Section>
          <Section id="interests" icon="interests" title="Interests" value={f.interests.length ? f.interests.map((k) => INTERESTS[k]).slice(0, 3).join(", ") + (f.interests.length > 3 ? "…" : "") : "Any"} active={active.interests} open={open} setOpen={setOpen}>
            <InterestPicker value={f.interests} onChange={(v) => set("interests", v)} max={8} />
          </Section>
          <Section id="lifestyle" icon="lifestyle" title="Lifestyle" value={active.lifestyle ? "Chosen" : "Any"} active={active.lifestyle} open={open} setOpen={setOpen}>
            <Chips><Chip small label="Verified only" selected={f.verified} onPress={() => set("verified", !f.verified)} /></Chips>
            {Object.entries(LIFESTYLE).map(([k, opts]) => (
              <View key={k} style={{ gap: 6 }}>
                <T v="caption" tone="muted">{LIFE_LABEL[k]}</T>
                <Chips>{Object.entries(opts as Record<string, string>).map(([v, l]) => <Chip key={v} small label={l} selected={(f.life[k] ?? []).includes(v)} onPress={() => set("life", { ...f.life, [k]: toggle(f.life[k] ?? [], v) })} />)}</Chips>
              </View>
            ))}
          </Section>
          <Section id="languages" icon="languages" title="Languages" value={f.languages.length ? f.languages.map((k) => LANGUAGES[k]).join(", ") : "Any"} active={active.languages} open={open} setOpen={setOpen}>
            <Chips>{Object.entries(LANGUAGES).map(([k, l]) => <Chip key={k} small label={l} selected={f.languages.includes(k)} onPress={() => set("languages", toggle(f.languages, k))} />)}</Chips>
            <T v="caption" tone="faint">Only people who chose to list their languages appear when you filter by language.</T>
          </Section>
          <Section id="education" icon="education" title="Education" value={f.education || "Any"} active={active.education} open={open} setOpen={setOpen}>
            <TextInput value={f.education} onChangeText={(v) => set("education", v)} placeholder="e.g. Design, MBA, IIT" placeholderTextColor={c.faint} maxLength={60} accessibilityLabel="Education" style={field} />
          </Section>
          <Section id="profession" icon="profession" title="Profession" value={f.profession || "Any"} active={active.profession} open={open} setOpen={setOpen}>
            <TextInput value={f.profession} onChangeText={(v) => set("profession", v)} placeholder="e.g. Architect, Doctor, Chef" placeholderTextColor={c.faint} maxLength={60} accessibilityLabel="Profession" style={field} />
          </Section>
          <Section id="relationship" icon="relationship" title="Relationship preferences" value={f.intents.length ? f.intents.map((k) => INTENTS[k as keyof typeof INTENTS]).join(", ") : "Any"} active={active.relationship} open={open} setOpen={setOpen}>
            <Chips>{Object.entries(INTENTS).map(([k, l]) => <Chip key={k} small label={l} selected={f.intents.includes(k)} onPress={() => set("intents", toggle(f.intents, k))} />)}</Chips>
          </Section>
        </ScrollView>
        <View style={{ position: "absolute", left: 20, right: 20, bottom: 16 }}>
          <Pressable accessibilityRole="button" disabled={count === 0} onPress={() => { haptic.medium(); router.push({ pathname: "/explore/[key]", params: { key: `s:${qs || "mode=recommended"}` } }); }}
            style={{ borderRadius: 30, overflow: "hidden", opacity: count === 0 ? 0.6 : 1, shadowColor: g.sunset[0], shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
            <LinearGradient colors={[g.sunset[0], g.sunset[2]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 58, alignItems: "center", justifyContent: "center" }}>
              <T v="headline" tone="white">{count === null ? "Show people" : count === 0 ? "No one yet — try fewer filters" : `Show ${count} ${count === 1 ? "person" : "people"} ✨`}</T>
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Chips({ children }: { children: ReactNode }) { return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>; }

/** A filter row with its luxury icon; the icon glows and springs when the filter is in use. */
function Section({ id, icon, title, value, active, open, setOpen, children }: { id: string; icon: string; title: string; value: string; active: boolean; open: string | null; setOpen: (v: string | null) => void; children: ReactNode }) {
  const { c, g, dark } = useTheme();
  const isOpen = open === id;
  return (
    <View style={{ borderRadius: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: active ? alpha(c.accent, 0.7) : c.line, overflow: "hidden" }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={`${title}: ${value}`} onPress={() => { haptic.tick(); setOpen(isOpen ? null : id); }}
        style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: active ? alpha(g.sunset[0], dark ? 0.2 : 0.1) : c.raised, shadowColor: g.sunset[0], shadowOpacity: active ? 0.5 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }}>
          <LuxIcon name={icon} size={24} active={active} color={c.muted} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="callout" strong>{title}</T>
          <T v="caption" tone={active ? "brand" : "faint"} numberOfLines={1}>{value}</T>
        </View>
        <Icon name={isOpen ? "minus" : "plus"} size={18} color={c.faint} />
      </Pressable>
      {isOpen && <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>{children}</View>}
    </View>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const { c } = useTheme();
  const btn = (d: number, l: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${d > 0 ? "older" : "younger"}`} disabled={value + d < min || value + d > max}
      onPress={() => { haptic.tick(); onChange(Math.min(max, Math.max(min, value + d))); }}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.raised, opacity: value + d < min || value + d > max ? 0.4 : 1 }}>
      <T v="headline">{l}</T>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <T v="caption" tone="muted">{label}</T>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {btn(-1, "−")}<T v="title" accessibilityLabel={`${label} ${value}`}>{value}</T>{btn(1, "+")}
      </View>
    </View>
  );
}
