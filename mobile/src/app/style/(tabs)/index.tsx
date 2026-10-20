import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { CATALOG, CATS, COLORS, FITS, TRENDS, inr, parseSearch, type CatalogItem } from "@shared/style/darzi.js";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { Chip, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { GarmentView } from "@/style/GarmentView";
import { STYLE_ACCENT, StyleHeader } from "@/style/StyleHeader";
import { useStyle } from "@/style/StyleContext";
import { useTheme } from "@/theme/ThemeProvider";

type Prefs = { fit: string; colors: string[]; occasions: string[]; set: boolean };
const OCCASIONS = [["office", "Office"], ["wedding", "Wedding"], ["casual", "Casual"], ["festive", "Festive"], ["party", "Party"]] as const;

function ItemCard({ it, w }: { it: CatalogItem; w: number }) {
  const { c } = useTheme();
  const { setDraft } = useStyle();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${it.name}, ${inr(it.price)}. Customize`} onPress={() => { haptic.tick(); setDraft(it.spec); router.push("/style/design"); }}
      style={{ width: w, backgroundColor: c.surface, borderRadius: 20, padding: 8, gap: 6 }}>
      <GarmentView spec={it.spec} size={w - 16} />
      {it.trend && <View style={{ position: "absolute", top: 14, left: 14, backgroundColor: STYLE_ACCENT, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><T v="caption" strong style={{ color: "#FFF", fontSize: 10 }}>NEW · 2026</T></View>}
      <T v="callout" strong numberOfLines={2}>{it.name}</T>
      <T v="caption" tone="muted" numberOfLines={2}>{it.trend ? it.why : `${it.spec.fit} · ${it.spec.fabric}`}</T>
      <T v="callout" strong style={{ color: STYLE_ACCENT }}>{inr(it.price)}</T>
    </Pressable>
  );
}

/** First visit: a few questions about style, so suggestions fit (all optional, changeable later). */
function PrefsSetup({ onDone }: { onDone: () => void }) {
  const { c } = useTheme();
  const [fit, setFit] = useState("Tailored");
  const [colors, setColors] = useState<string[]>([]);
  const [occ, setOcc] = useState<string[]>([]);
  const toggle = (list: string[], v: string, set: (x: string[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 22, padding: 16, gap: 10 }}>
      <T v="headline">Your style, in three taps</T>
      <T v="callout" tone="muted">We'll use this to suggest clothes. Skip anything you like.</T>
      <T v="callout" strong>How do you like clothes to fit?</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{FITS.map((f) => <Chip key={f} label={f} selected={fit === f} onPress={() => setFit(f)} />)}</View>
      <T v="callout" strong>Colours you wear most</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {Object.entries(COLORS).slice(0, 18).map(([n, hex]) => (
          <Pressable key={n} accessibilityRole="checkbox" accessibilityState={{ checked: colors.includes(n) }} accessibilityLabel={n} onPress={() => toggle(colors, n, setColors)}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: hex, borderWidth: colors.includes(n) ? 3 : 1, borderColor: colors.includes(n) ? STYLE_ACCENT : c.line }} />
        ))}
      </View>
      <T v="callout" strong>What do you dress for?</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{OCCASIONS.map(([k, l]) => <Chip key={k} label={l} selected={occ.includes(k)} onPress={() => toggle(occ, k, setOcc)} />)}</View>
      <Button title="Save my style" onPress={async () => { await api("/api/style/prefs", { method: "PUT", body: { fit, colors, occasions: occ } }).catch(() => {}); onDone(); }} />
    </View>
  );
}

export default function Shop() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: ["style-prefs"], queryFn: () => api<{ prefs: Prefs }>("/api/style/prefs") });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const colW = Math.floor((Math.min(width, 640) - 20 * 2 - 12) / 2);
  const found = useMemo(() => (q.trim() ? parseSearch(q) : null), [q]);
  const liked = prefs.data?.prefs;
  const items = useMemo(() => {
    let list = found ? found.items : CATALOG;
    if (cat) list = list.filter((i) => i.spec.category === cat);
    // Gentle personal order: occasions and colours you picked first.
    if (!found && liked?.set) list = [...list].sort((a, b) => score(b) - score(a));
    return list;
    function score(i: CatalogItem) { return (liked!.occasions.some((o) => i.occ.includes(o)) ? 2 : 0) + (liked!.colors.includes(i.spec.color) ? 1 : 0); }
  }, [found, cat, liked]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        <StyleHeader title="Clothes made for you" sub="Pick a style or describe your own. We make it to your measurements." />
        {prefs.data && !prefs.data.prefs.set && <PrefsSetup onDone={() => qc.invalidateQueries({ queryKey: ["style-prefs"] })} />}
        <TextInput value={q} onChangeText={setQ} placeholder='Try "linen kurta for a wedding under 5000"' placeholderTextColor={c.faint} accessibilityLabel="Search clothes"
          style={{ borderRadius: 18, backgroundColor: c.raised, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: c.text, fontFamily: "Figtree_500Medium" }} />
        {found && <T v="caption" tone="muted">{found.u.length ? `Showing: ${found.u.join(" · ")}` : "Showing everything that matches your words"}</T>}
        {!q && (
          <View style={{ gap: 10 }}>
            <T v="headline">Latest · 2026</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {TRENDS.slice(0, 10).map((it) => <ItemCard key={it.id} it={it} w={Math.min(170, colW)} />)}
            </ScrollView>
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" selected={!cat} onPress={() => setCat(null)} />
          {Object.entries(CATS).filter(([k]) => k !== "custom").map(([k, v]) => <Chip key={k} label={v.name} selected={cat === k} onPress={() => setCat(cat === k ? null : k)} />)}
        </ScrollView>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {items.map((it) => <ItemCard key={it.id} it={it} w={colW} />)}
        </View>
        {!items.length && <T tone="muted" center>Nothing matches yet. Try fewer words — or design it yourself in Design.</T>}
        <Button title="Start from my own idea" v="outline" onPress={() => router.push("/style/design")} />
      </ScrollView>
    </Screen>
  );
}
