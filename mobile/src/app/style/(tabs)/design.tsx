import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { CATS, COLORS, PATTERNS, defaultSpec, describe, fitsOf, inr, normalize, parsePrompt, price, recommend, type Spec } from "@shared/style/darzi.js";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { Banner, Chip, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { GarmentView } from "@/style/GarmentView";
import { STYLE_ACCENT, StyleHeader } from "@/style/StyleHeader";
import { useStyle } from "@/style/StyleContext";
import type { StyleDesign, StyleProfile } from "@/style/types";
import { useTheme } from "@/theme/ThemeProvider";

function Row({ label, options, value, onPick }: { label: string; options: string[] | null; value: string | null; onPick: (v: string) => void }) {
  if (!options?.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <T v="callout" strong>{label}</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((o) => <Chip key={o} label={o} selected={value === o} onPress={() => onPick(o)} />)}
      </ScrollView>
    </View>
  );
}

export default function Design() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { draft, setDraft, prompt, setPrompt } = useStyle();
  const [understood, setUnderstood] = useState<string[] | null>(null);
  const [view, setView] = useState<"front" | "back">("front");
  const [note, setNote] = useState("");
  const [occasion, setOccasion] = useState<string | null>(null);
  const profiles = useQuery({ queryKey: ["style-profiles"], queryFn: () => api<{ profiles: StyleProfile[] }>("/api/style/profiles") });
  const designs = useQuery({ queryKey: ["style-designs"], queryFn: () => api<{ designs: StyleDesign[] }>("/api/style/designs") });
  const cat = CATS[draft.category];
  const set = (k: keyof Spec, v: string) => { haptic.tick(); setDraft(normalize({ ...draft, [k]: v })); };
  const self = profiles.data?.profiles.find((p) => p.rel === "Self" && p.m) ?? null;

  function applyPrompt() {
    const { ch, u } = parsePrompt(prompt);
    const base = ch.category && ch.category !== draft.category ? defaultSpec(ch.category) : draft;
    setDraft(normalize({ ...base, ...ch } as Spec));
    setUnderstood(u);
    haptic.light();
  }
  async function save() {
    setNote("");
    try { await api("/api/style/designs", { body: { spec: draft, prompt: prompt || undefined } }); setNote("Saved to your designs."); qc.invalidateQueries({ queryKey: ["style-designs"] }); }
    catch (e: any) { setNote(e.message); }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <StyleHeader title="Design studio" sub="Describe it in your own words, then fine-tune every detail." />

        <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 14, gap: 10 }}>
          <T v="callout" strong>Describe what you want</T>
          <TextInput value={prompt} onChangeText={setPrompt} multiline maxLength={500} accessibilityLabel="Describe your design"
            placeholder="e.g. a slim white linen shirt with a mandarin collar, hidden buttons and a slightly longer back" placeholderTextColor={c.faint}
            style={{ minHeight: 70, borderRadius: 14, backgroundColor: c.raised, padding: 12, fontSize: 16, color: c.text, fontFamily: "Figtree_500Medium", textAlignVertical: "top" }} />
          <Button title="Create my design" icon="sparkle" disabled={!prompt.trim()} onPress={applyPrompt} />
          {understood && (understood.length
            ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}><T v="caption" tone="muted">Understood:</T>{understood.map((u) => <View key={u} style={{ backgroundColor: c.accentWash, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><T v="caption">{u}</T></View>)}</View>
            : <T v="caption" tone="muted">We didn't catch specific details there — pick them below instead.</T>)}
        </View>

        <View style={{ alignItems: "center", gap: 8 }}>
          <GarmentView spec={draft} view={view} size={250} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="Front" selected={view === "front"} onPress={() => setView("front")} />
            <Chip label="Back" selected={view === "back"} onPress={() => setView("back")} />
          </View>
          <T v="callout" tone="muted" center>{describe(draft)}</T>
          <T v="title" style={{ color: STYLE_ACCENT }}>{inr(price(draft))}</T>
          <T v="caption" tone="faint">Ready in about {cat.days} days after you confirm measurements.</T>
        </View>

        <Row label="Garment" options={Object.keys(CATS)} value={draft.category} onPick={(k) => setDraft(defaultSpec(k))} />
        <Row label="Fabric" options={cat.fab} value={draft.fabric} onPick={(v) => set("fabric", v)} />
        <View style={{ gap: 6 }}>
          <T v="callout" strong>Colour · {draft.color}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(COLORS).map(([n, hex]) => (
              <Pressable key={n} accessibilityRole="radio" accessibilityState={{ selected: draft.color === n }} accessibilityLabel={n} onPress={() => set("color", n)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: hex, borderWidth: draft.color === n ? 3 : 1, borderColor: draft.color === n ? STYLE_ACCENT : c.line }} />
            ))}
          </View>
        </View>
        <Row label="Pattern" options={PATTERNS} value={draft.pattern} onPick={(v) => set("pattern", v)} />
        <Row label={cat.collarLabel ?? "Collar"} options={cat.collars} value={draft.collar} onPick={(v) => set("collar", v)} />
        <Row label="Sleeves" options={cat.sleeves} value={draft.sleeves} onPick={(v) => set("sleeves", v)} />
        <Row label={cat.buttonsLabel ?? "Buttons"} options={cat.buttons} value={draft.buttons} onPick={(v) => set("buttons", v)} />
        <Row label="Pockets" options={cat.pockets} value={draft.pockets} onPick={(v) => set("pockets", v)} />
        <Row label="Fit" options={fitsOf(draft.category)} value={draft.fit} onPick={(v) => set("fit", v)} />
        <Row label="Length" options={cat.lengths} value={draft.length} onPick={(v) => set("length", v)} />

        {note ? <Banner tone="info">{note}</Banner> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button title="Save design" v="outline" style={{ flex: 1 }} onPress={save} />
          <Button title="Next: measurements" style={{ flex: 1 }} onPress={() => router.push("/style/measure")} />
        </View>

        <View style={{ gap: 8 }}>
          <T v="headline">Need ideas? Outfits for…</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{["Office", "Wedding", "Casual", "Festive"].map((o) => <Chip key={o} label={o} selected={occasion === o} onPress={() => setOccasion(occasion === o ? null : o)} />)}</View>
          {occasion && recommend(occasion, self).map(({ spec, reason }) => (
            <Pressable key={reason} accessibilityRole="button" onPress={() => { setDraft(spec); setOccasion(null); }} style={{ flexDirection: "row", gap: 10, backgroundColor: c.surface, borderRadius: 18, padding: 10, alignItems: "center" }}>
              <GarmentView spec={spec} size={70} />
              <View style={{ flex: 1, gap: 2 }}><T v="callout" strong>{CATS[spec.category].one} · {inr(price(spec))}</T><T v="caption" tone="muted">{reason}</T></View>
            </Pressable>
          ))}
          {occasion && !self && <T v="caption" tone="faint">Add your measurements to get suggestions that fit your shape.</T>}
        </View>

        {!!designs.data?.designs.length && (
          <View style={{ gap: 8 }}>
            <T v="headline">Your saved designs</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {designs.data.designs.map((d) => (
                <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={`Open ${d.name}`} onPress={() => setDraft(d.spec)} style={{ width: 120, gap: 4 }}>
                  <GarmentView spec={d.spec} size={120} /><T v="caption" numberOfLines={2}>{d.name}</T>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
