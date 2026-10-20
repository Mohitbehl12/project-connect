import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { MEAS, REF, TAPE, cm, fitScore, refIssues, uncertain, type Measurements } from "@shared/style/darzi.js";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { Banner, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { STYLE_ACCENT, StyleHeader } from "@/style/StyleHeader";
import type { StyleProfile } from "@/style/types";
import { useTheme } from "@/theme/ThemeProvider";

const CONF_TONE: Record<string, "trust" | "muted" | "alert"> = { High: "trust", Verified: "trust", Edited: "trust", Medium: "muted", Low: "alert" };

export default function Review() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["style-profiles"], queryFn: () => api<{ profiles: StyleProfile[] }>("/api/style/profiles") });
  const p = q.data?.profiles.find((x) => x.id === id);
  const [m, setM] = useState<Measurements | null>(null);
  const [ref, setRef] = useState<Record<string, string>>({ chest: "", shoulder: "", sleeve: "", length: "" });
  const [msg, setMsg] = useState<{ tone: "info" | "alert" | "trust"; text: string } | null>(null);
  useEffect(() => { if (p && !m) { setM(p.m ? JSON.parse(JSON.stringify(p.m)) : null); if (p.ref) setRef(p.ref); } }, [p, m]);
  const open = useMemo(() => new Set(m ? uncertain(m).map(([k]) => k) : []), [m]);
  const fs = useMemo(() => fitScore(m ? { m, fit: p?.fit ?? "Tailored", ref } : null), [m, ref, p?.fit]);
  const issues = useMemo(() => (m ? refIssues({ m, fit: p?.fit ?? "Tailored", ref }) : null), [m, ref, p?.fit]);

  if (!p || !m) return <Screen><StyleHeader title="Measurements" back /><T tone="muted">{q.isLoading ? "Loading…" : "This profile has no measurements yet."}</T></Screen>;

  const setV = (k: string, v: string) => { const n = Number(v); if (!Number.isFinite(n)) return; setM({ ...m, [k]: { ...m[k], v: n, c: "Edited", u: false, src: "you" } }); };
  const verify = (k: string) => { haptic.tick(); setM({ ...m, [k]: { ...m[k], c: "Verified", u: false } }); };
  async function save(next?: boolean) {
    setMsg(null);
    try {
      await api(`/api/style/profiles/${p!.id}`, { method: "PUT", body: { name: p!.name, rel: p!.rel, fit: p!.fit, m, ref: REF.every(([k]) => Number(ref[k]) > 0) ? ref : null, method: p!.method === "estimate" && Object.values(m ?? {}).some((x) => x.c === "Edited" || x.c === "Verified") ? "tape" : p!.method ?? "tape" } });
      qc.invalidateQueries({ queryKey: ["style-profiles"] });
      haptic.success();
      if (next) router.push("/style/preview"); else setMsg({ tone: "trust", text: "Saved." });
    } catch (e: any) { setMsg({ tone: "alert", text: e.message }); }
  }
  const input = { width: 78, borderRadius: 10, backgroundColor: c.raised, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, color: c.text, fontFamily: "Figtree_600SemiBold", textAlign: "right" as const };
  let group = "";

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <StyleHeader title={`Review: ${p.name}`} sub="Highlighted values are the ones worth checking with a soft tape. Inches." back />

        <View style={{ backgroundColor: fs.score === 100 ? c.trustWash : c.surface, borderRadius: 20, padding: 14, gap: 6 }}>
          <T v="headline">{fs.score === 100 ? "Fit Locked ✓ — 100% Fit Guarantee" : `Fit Lock: ${fs.score}%`}</T>
          <T v="caption" tone="muted">{fs.score === 100 ? "If it doesn't fit, we alter or remake it free." : "Reach 100% for the Fit Guarantee: free alteration or remake if it doesn't fit."}</T>
          {fs.gates.map(([label, v, note]) => (
            <View key={label} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: v >= 1 ? c.trust : v > 0 ? STYLE_ACCENT : c.line }} />
              <T v="callout" style={{ flex: 1 }}>{label}</T><T v="caption" tone="muted">{note}</T>
            </View>
          ))}
        </View>

        {MEAS.map(([k, label, grp]) => {
          const x = m[k];
          const head = grp !== group ? (group = grp) : null;
          const needs = open.has(k);
          return (
            <View key={k} style={{ gap: 4 }}>
              {head && <T v="caption" strong tone="muted" style={{ marginTop: 6, letterSpacing: 0.5 }}>{grp.toUpperCase()}</T>}
              <View style={{ backgroundColor: needs ? c.accentWash : c.surface, borderRadius: 16, padding: 10, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T v="callout" style={{ flex: 1 }}>{label}</T>
                  <TextInput value={String(x.v)} onChangeText={(v) => setV(k, v)} keyboardType="decimal-pad" accessibilityLabel={`${label} in inches`} style={input} />
                  <T v="caption" tone="faint" style={{ width: 54 }}>in · {cm(x.v)} cm</T>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T v="caption" tone={CONF_TONE[x.c] ?? "muted"} style={{ flex: 1 }}>{x.c}{x.src === "estimate" ? " · estimated" : x.src === "you" ? " · you entered" : ""}</T>
                  {needs && <Pressable accessibilityRole="button" onPress={() => verify(k)}><T v="caption" strong style={{ color: STYLE_ACCENT }}>Tape matches ✓</T></Pressable>}
                </View>
                {needs && <T v="caption" tone="muted">{TAPE[k] ?? "Measure with a soft tape, snug but not tight."}</T>}
              </View>
            </View>
          );
        })}

        <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 14, gap: 8 }}>
          <T v="headline">Cross-check with a shirt that fits you</T>
          <T v="caption" tone="muted">Lay a well-fitting shirt flat and measure it. This catches mistakes before we cut fabric.</T>
          {REF.map(([k, label]) => (
            <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T v="callout" style={{ flex: 1 }}>{label}</T>
              <TextInput value={ref[k]} onChangeText={(v) => setRef({ ...ref, [k]: v.replace(/[^\d.]/g, "") })} keyboardType="decimal-pad" accessibilityLabel={label} placeholder="in" placeholderTextColor={c.faint} style={input} />
            </View>
          ))}
          {issues?.map((i) => (
            <View key={i.k} style={{ backgroundColor: c.accentWash, borderRadius: 12, padding: 10, gap: 4 }}>
              <T v="caption">{i.msg}</T>
              <Pressable accessibilityRole="button" onPress={() => setM({ ...m, [i.k]: { ...m[i.k], v: i.fix, c: "Edited", u: false, src: "you" } })}><T v="caption" strong style={{ color: STYLE_ACCENT }}>Use {i.fix} in</T></Pressable>
            </View>
          ))}
          {issues && !issues.length && <T v="caption" tone="trust">Matches your measurements ✓</T>}
        </View>

        {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button title="Save" v="outline" style={{ flex: 1 }} onPress={() => save()} />
          <Button title="Save and preview" style={{ flex: 1 }} onPress={() => save(true)} />
        </View>
        <Pressable accessibilityRole="button" onPress={async () => { await api(`/api/style/profiles/${p.id}`, { method: "DELETE" }).catch(() => {}); qc.invalidateQueries({ queryKey: ["style-profiles"] }); router.back(); }} style={{ alignSelf: "center", padding: 10 }}>
          <T v="callout" tone="alert">Delete this profile</T>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
