import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { INTENTS, INTEREST_EMOJI, INTERESTS, LIFESTYLE } from "@shared/constants";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { T } from "@/components/Text";
import { Banner, Chip, Field, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const PROMPTS = ["A perfect first date for me is", "I'm quietly proud of", "The way to my heart is", "My friends would describe me as", "Something I'm learning right now", "I'll know it's going well when"];
const LIFESTYLE_LABEL: Record<string, string> = { drinking: "Drinking", smoking: "Smoking", food: "Food", exercise: "Exercise", pets: "Pets" };

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 22, padding: 16, gap: 12 }}>
      <View style={{ gap: 2 }}><T v="headline">{title}</T>{hint ? <T v="caption" tone="muted">{hint}</T> : null}</View>
      {children}
    </View>
  );
}

export default function EditProfile() {
  const { me, refetchMe } = useAuth();
  const { c } = useTheme();
  const qc = useQueryClient();
  const p = me?.profile;
  const [bio, setBio] = useState(p?.bio ?? "");
  const [ideas, setIdeas] = useState<{ text: string; why: string }[] | null>(null);
  const [seed, setSeed] = useState(0);
  async function askCupid() {
    try { const r = await api<{ ideas: { text: string; why: string }[] }>("/api/cupid", { body: { task: "bio", seed } }); setIdeas(r.ideas); setSeed(seed + 1); } catch { setIdeas([]); }
  }
  const [prompts, setPrompts] = useState<{ q: string; a: string }[]>(() => { try { return JSON.parse(p?.prompts ?? "[]"); } catch { return []; } });
  const [interests, setInterests] = useState<string[]>(p?.interests ? p.interests.split(",").filter(Boolean) : []);
  const [intent, setIntent] = useState(p?.intent ?? "");
  const [profession, setProfession] = useState(p?.profession ?? "");
  const [education, setEducation] = useState(p?.education ?? "");
  const [height, setHeight] = useState(p?.heightCm ? String(p.heightCm) : "");
  const [life, setLife] = useState<Record<string, string | null>>({ drinking: p?.drinking ?? null, smoking: p?.smoking ?? null, food: p?.food ?? null, exercise: p?.exercise ?? null, pets: p?.pets ?? null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr(""); setBusy(true);
    try {
      await api("/api/profile", {
        method: "PATCH",
        body: { bio: bio.trim(), prompts: prompts.filter((x) => x.q && x.a.trim()), interests, intent, profession: profession.trim() || null, education: education.trim() || null, heightCm: height ? Number(height) : null, ...life },
      });
      haptic.success();
      await refetchMe();
      qc.invalidateQueries({ queryKey: ["discovery"] });
      router.back();
    } catch (e: any) { setErr(e.message); haptic.warning(); } finally { setBusy(false); }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Header title="Edit profile" sub="Small details give people something to talk about." />
        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <Section title="About me" hint={`${bio.length}/500 · a few honest lines beat a list of adjectives`}>
            <TextInput value={bio} onChangeText={setBio} multiline maxLength={500} accessibilityLabel="About me" placeholder="Weekday spreadsheets, weekend trails…" placeholderTextColor={c.faint}
              style={{ minHeight: 100, borderRadius: 16, backgroundColor: c.raised, padding: 14, fontSize: 17, color: c.text, fontFamily: "Figtree_500Medium", textAlignVertical: "top" }} />
            <Pressable accessibilityRole="button" onPress={askCupid} style={{ alignSelf: "flex-start", paddingVertical: 6 }}>
              <T v="callout" strong tone="brand">{ideas ? "More ideas from Cupid ✨" : "Cupid, help me write this ✨"}</T>
            </Pressable>
            {ideas?.map((i) => (
              <Pressable key={i.text} accessibilityRole="button" accessibilityLabel={`Use: ${i.text}`} onPress={() => { haptic.tick(); setBio(i.text); }} style={{ backgroundColor: c.surface, borderRadius: 14, padding: 12, gap: 2 }}>
                <T v="callout">{i.text}</T><T v="caption" tone="faint">{i.why} · tap to use, then make it yours</T>
              </Pressable>
            ))}
          </Section>
          <Section title="Prompts" hint="Up to three. These are what people reply to most.">
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {prompts[i]?.q
                    ? <Chip label={prompts[i].q} selected onPress={() => setPrompts(prompts.filter((_, j) => j !== i))} />
                    : i === prompts.length && PROMPTS.filter((q) => !prompts.some((x) => x.q === q)).slice(0, 4).map((q) => <Chip key={q} small label={q} onPress={() => setPrompts([...prompts, { q, a: "" }])} />)}
                </View>
                {prompts[i]?.q && (
                  <TextInput value={prompts[i].a} onChangeText={(a) => setPrompts(prompts.map((x, j) => (j === i ? { ...x, a } : x)))} maxLength={200} placeholder="Your answer" placeholderTextColor={c.faint}
                    accessibilityLabel={prompts[i].q}
                    style={{ minHeight: 48, borderRadius: 14, backgroundColor: c.raised, paddingHorizontal: 14, fontSize: 17, color: c.text, fontFamily: "Figtree_500Medium" }} />
                )}
              </View>
            ))}
          </Section>
          <Section title="Looking for">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{Object.entries(INTENTS).map(([k, l]) => <Chip key={k} label={l} selected={intent === k} onPress={() => setIntent(k)} />)}</View>
          </Section>
          <Section title="Interests" hint={`${interests.length}/10 chosen`}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(INTERESTS).map(([k, l]) => <Chip key={k} label={l} emoji={INTEREST_EMOJI[k]} selected={interests.includes(k)}
                onPress={() => setInterests(interests.includes(k) ? interests.filter((x) => x !== k) : interests.length >= 10 ? interests : [...interests, k])} />)}
            </View>
          </Section>
          <Section title="The basics">
            <Field label="Work" value={profession} onChangeText={setProfession} maxLength={80} />
            <Field label="Education" value={education} onChangeText={setEducation} maxLength={80} />
            <Field label="Height (cm)" value={height} onChangeText={(t) => setHeight(t.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" />
          </Section>
          <Section title="Lifestyle">
            {(Object.keys(LIFESTYLE) as (keyof typeof LIFESTYLE)[]).map((k) => (
              <View key={k} style={{ gap: 6 }}>
                <T v="callout" tone="muted">{LIFESTYLE_LABEL[k]}</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(LIFESTYLE[k]).map(([v, l]) => <Chip key={v} small label={l} selected={life[k] === v} onPress={() => setLife({ ...life, [k]: life[k] === v ? null : v })} />)}
                </View>
              </View>
            ))}
          </Section>
          {err ? <Banner tone="alert">{err}</Banner> : null}
        </ScrollView>
        <Button title="Save changes" size="lg" full loading={busy} onPress={save} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
