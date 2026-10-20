import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { FITS, estimateM } from "@shared/style/darzi.js";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, Chip, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { STYLE_ACCENT, StyleHeader } from "@/style/StyleHeader";
import { useStyle } from "@/style/StyleContext";
import type { StyleProfile } from "@/style/types";
import { useTheme } from "@/theme/ThemeProvider";

const SHAPES = ["Slim", "Average", "Athletic", "Fuller middle"];
const SIZES = ["S", "M", "L", "XL", "XXL"];

export default function Measure() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { profileId, setProfileId } = useStyle();
  const q = useQuery({ queryKey: ["style-profiles"], queryFn: () => api<{ profiles: StyleProfile[] }>("/api/style/profiles") });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("Me");
  const [rel, setRel] = useState("Self");
  const [fit, setFit] = useState("Tailored");
  const [unit, setUnit] = useState<"ft" | "cm">("ft");
  const [ft, setFt] = useState("5"); const [inch, setInch] = useState("8"); const [cmH, setCmH] = useState("173");
  const [kg, setKg] = useState("");
  const [shape, setShape] = useState("Average");
  const [size, setSize] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const heightIn = unit === "ft" ? Number(ft) * 12 + Number(inch || 0) : Number(cmH) / 2.54;

  async function create(method: "estimate" | "tape") {
    setErr("");
    if (!(heightIn >= 48 && heightIn <= 90)) { setErr("Enter a height between 4 ft and 7 ft 6 in (122–228 cm)."); return; }
    const m = estimateM(Math.round(heightIn * 10) / 10, Number(kg) || 0, shape, size, Date.now() % 100000);
    // For tape entry, every value starts as a guess the person replaces.
    if (method === "tape") Object.values(m).forEach((x) => { x.c = "Low"; x.u = true; });
    m.height = { v: Math.round(heightIn * 10) / 10, c: "High", u: false, src: "you" };
    try {
      const r = await api<{ profile: StyleProfile }>("/api/style/profiles", { body: { name: name.trim() || "Me", rel, fit, m, method } });
      setProfileId(r.profile.id); setAdding(false);
      qc.invalidateQueries({ queryKey: ["style-profiles"] });
      router.push({ pathname: "/style/review", params: { id: r.profile.id } });
    } catch (e: any) { setErr(e.message); }
  }

  const input = { borderRadius: 14, backgroundColor: c.raised, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: c.text, fontFamily: "Figtree_500Medium" } as const;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <StyleHeader title="Measurements" sub="One profile for you, and more for family or friends you order for." />
        {q.data?.profiles.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" onPress={() => { setProfileId(p.id); router.push({ pathname: "/style/review", params: { id: p.id } }); }}
            style={{ backgroundColor: c.surface, borderRadius: 20, padding: 14, gap: 4, borderWidth: profileId === p.id ? 2 : 0, borderColor: STYLE_ACCENT }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T v="headline" style={{ flex: 1 }}>{p.name} <T tone="muted">· {p.rel}</T></T>
              <View style={{ backgroundColor: p.fitLocked ? c.trustWash : c.accentWash, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                <T v="caption" strong>{p.m ? (p.fitLocked ? "Fit Locked ✓" : `Fit ${p.fitScore}%`) : "Not measured"}</T>
              </View>
            </View>
            <T v="caption" tone="muted">{p.m ? `Chest ${p.m.chest?.v} · Waist ${p.m.waist?.v} · Height ${p.m.height?.v} in · ${p.method === "tape" ? "measured with a tape" : p.method === "estimate" ? "estimated — check with a tape for a perfect fit" : ""}` : "Add measurements to order."}</T>
            {profileId === p.id && <T v="caption" style={{ color: STYLE_ACCENT }}>Used for your next order</T>}
          </Pressable>
        ))}

        {!adding ? (
          <Button title="Add a measurement profile" icon="plus" v={q.data?.profiles.length ? "outline" : "primary"} onPress={() => setAdding(true)} />
        ) : (
          <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 14, gap: 10 }}>
            <T v="headline">New profile</T>
            <TextInput value={name} onChangeText={setName} placeholder="Name (e.g. Me, Father)" accessibilityLabel="Profile name" placeholderTextColor={c.faint} style={input} />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{["Self", "Family", "Friend"].map((r) => <Chip key={r} label={r} selected={rel === r} onPress={() => setRel(r)} />)}</View>
            <T v="callout" strong>Height</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Chip label="ft / in" selected={unit === "ft"} onPress={() => setUnit("ft")} /><Chip label="cm" selected={unit === "cm"} onPress={() => setUnit("cm")} />
            </View>
            {unit === "ft" ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput value={ft} onChangeText={setFt} keyboardType="number-pad" accessibilityLabel="Feet" style={[input, { width: 70 }]} /><T style={{ alignSelf: "center" }}>ft</T>
                <TextInput value={inch} onChangeText={setInch} keyboardType="number-pad" accessibilityLabel="Inches" style={[input, { width: 70 }]} /><T style={{ alignSelf: "center" }}>in</T>
              </View>
            ) : <TextInput value={cmH} onChangeText={setCmH} keyboardType="number-pad" accessibilityLabel="Height in centimetres" style={[input, { width: 110 }]} />}
            <T v="callout" strong>Weight (optional)</T>
            <TextInput value={kg} onChangeText={setKg} keyboardType="number-pad" placeholder="kg" accessibilityLabel="Weight in kilograms" placeholderTextColor={c.faint} style={[input, { width: 110 }]} />
            <T v="callout" strong>Body shape</T>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{SHAPES.map((s) => <Chip key={s} label={s} selected={shape === s} onPress={() => setShape(s)} />)}</View>
            <T v="callout" strong>Usual shirt size (optional)</T>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{SIZES.map((s) => <Chip key={s} label={s} selected={size === s} onPress={() => setSize(size === s ? null : s)} />)}</View>
            <T v="callout" strong>Preferred fit</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{FITS.map((f) => <Chip key={f} label={f} selected={fit === f} onPress={() => setFit(f)} />)}</ScrollView>
            {err ? <Banner tone="alert">{err}</Banner> : null}
            <Button title="Quick estimate (1 minute)" onPress={() => create("estimate")} />
            <Button title="I'll measure with a tape" v="outline" onPress={() => create("tape")} />
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Icon name="camera" size={18} color={c.muted} />
              <T v="caption" tone="muted" style={{ flex: 1 }}>Measuring from two phone photos (as on the Darzi site) is coming to the app next. For now, the estimate plus a few tape checks gets you to a 100% Fit Lock.</T>
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
