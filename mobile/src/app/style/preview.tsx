import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { CATS, describe, finished, fitScore, inr, price } from "@shared/style/darzi.js";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { Chip, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { GarmentView } from "@/style/GarmentView";
import { STYLE_ACCENT, StyleHeader } from "@/style/StyleHeader";
import { useStyle } from "@/style/StyleContext";
import type { StyleProfile } from "@/style/types";
import { useTheme } from "@/theme/ThemeProvider";

/** Virtual preview: front and back, the finished garment measurements, price and delivery estimate. */
export default function Preview() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { draft, profileId, setProfileId } = useStyle();
  const q = useQuery({ queryKey: ["style-profiles"], queryFn: () => api<{ profiles: StyleProfile[] }>("/api/style/profiles") });
  const withM = (q.data?.profiles ?? []).filter((p) => p.m);
  const p = withM.find((x) => x.id === profileId) ?? withM[0];
  const size = Math.min(170, (Math.min(width, 640) - 52) / 2);
  const days = CATS[draft.category].days;
  const by = new Date(Date.now() + (days + 2) * 86_400_000);
  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
        <StyleHeader title="Preview" sub={describe(draft)} back />
        <View style={{ flexDirection: "row", gap: 12, justifyContent: "center" }}>
          <View style={{ alignItems: "center", gap: 4 }}><GarmentView spec={draft} view="front" size={size} /><T v="caption" tone="muted">Front</T></View>
          <View style={{ alignItems: "center", gap: 4 }}><GarmentView spec={draft} view="back" size={size} /><T v="caption" tone="muted">Back</T></View>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 14, gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T v="headline">{CATS[draft.category].one}</T><T v="headline" style={{ color: STYLE_ACCENT }}>{inr(price(draft))}</T></View>
          {[["Fabric", `${draft.fabric} · ${draft.color} · ${draft.pattern}`], ["Fit", draft.fit], ["Details", [draft.collar, draft.sleeves && `${draft.sleeves} sleeves`, draft.buttons, draft.pockets, draft.length].filter((x) => x && x !== "None").join(" · ")], ["Delivery", `About ${days} days to make · by ${by.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`]].map(([k, v]) => (
            <View key={k} style={{ flexDirection: "row", gap: 10 }}><T v="callout" tone="muted" style={{ width: 70 }}>{k}</T><T v="callout" style={{ flex: 1 }}>{v}</T></View>
          ))}
        </View>
        <T v="headline">Made to whose measurements?</T>
        {withM.length ? (
          <>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{withM.map((x) => <Chip key={x.id} label={`${x.name}${x.fitLocked ? " ✓" : ""}`} selected={p?.id === x.id} onPress={() => setProfileId(x.id)} />)}</View>
            {p?.m && (
              <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 14, gap: 4 }}>
                <T v="callout" strong>Finished garment (inches)</T>
                {finished(draft, p.m, {}).map(([l, v]) => <View key={l} style={{ flexDirection: "row", justifyContent: "space-between" }}><T v="callout" tone="muted">{l}</T><T v="callout">{v.toFixed(1)}</T></View>)}
                <T v="caption" tone={fitScore(p).score === 100 ? "trust" : "muted"} style={{ marginTop: 4 }}>{fitScore(p).score === 100 ? "Fit Locked — free alteration or remake if it doesn't fit." : `Fit Lock ${fitScore(p).score}%. Check the highlighted measurements to get the Fit Guarantee.`}</T>
              </View>
            )}
            <Button title="Order this" onPress={() => router.push("/style/checkout")} />
          </>
        ) : <Button title="Add measurements first" onPress={() => router.push("/style/measure")} />}
      </ScrollView>
    </Screen>
  );
}
