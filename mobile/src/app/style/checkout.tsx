import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { CATS, describe, inr, price } from "@shared/style/darzi.js";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { STYLE_ACCENT, StyleHeader } from "@/style/StyleHeader";
import { useStyle } from "@/style/StyleContext";
import type { StyleOrder, StyleProfile } from "@/style/types";
import { useTheme } from "@/theme/ThemeProvider";

/** Order review: everything that will be charged, the delivery date, then a secure payment page. */
export default function Checkout() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { draft, profileId } = useStyle();
  const q = useQuery({ queryKey: ["style-profiles"], queryFn: () => api<{ profiles: StyleProfile[] }>("/api/style/profiles") });
  const p = (q.data?.profiles ?? []).filter((x) => x.m).find((x) => x.id === profileId) ?? (q.data?.profiles ?? []).find((x) => x.m);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const total = price(draft);
  const days = CATS[draft.category].days;
  const by = new Date(Date.now() + (days + 2) * 86_400_000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const input = { borderRadius: 14, backgroundColor: c.raised, padding: 12, fontSize: 16, color: c.text, fontFamily: "Figtree_500Medium", textAlignVertical: "top" as const };

  async function place() {
    if (!p) return;
    setErr(""); setBusy(true);
    try {
      const r = await api<{ order: StyleOrder; payUrl: string }>("/api/style/orders", { body: { spec: draft, profileId: p.id, notes, address, acceptTerms: true } });
      haptic.success();
      await WebBrowser.openBrowserAsync(r.payUrl).catch(() => {});
      qc.invalidateQueries({ queryKey: ["style-orders"] });
      router.replace({ pathname: "/style/orders/[id]", params: { id: r.order.id } });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <StyleHeader title="Review your order" back />
        <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 14, gap: 6 }}>
          <T v="callout" tone="muted">{describe(draft)}</T>
          <T v="callout">For: <T v="callout" strong>{p?.name ?? "—"}</T>{p?.fitLocked ? " · Fit Locked ✓" : ""}</T>
          <View style={{ height: 1, backgroundColor: c.line, marginVertical: 6 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T>Total (incl. making and fabric)</T><T strong style={{ color: STYLE_ACCENT }}>{inr(total)}</T></View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T tone="muted">Delivery</T><T tone="muted">Free · by {by}</T></View>
          <T v="caption" tone="faint">One payment. No subscription. Prices include taxes where they apply.</T>
        </View>
        <T v="callout" strong>Delivery address</T>
        <TextInput value={address} onChangeText={setAddress} multiline accessibilityLabel="Delivery address" placeholder="House, street, area, city, PIN code" placeholderTextColor={c.faint} style={[input, { minHeight: 80 }]} />
        <T v="caption" tone="faint">Only our workshop and courier see this, to deliver your order.</T>
        <T v="callout" strong>Instructions for the tailor (optional)</T>
        <TextInput value={notes} onChangeText={setNotes} multiline maxLength={600} accessibilityLabel="Instructions for the tailor" placeholder="e.g. a little roomier at the sleeves" placeholderTextColor={c.faint} style={[input, { minHeight: 60 }]} />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => setAgree(!agree)} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: agree ? STYLE_ACCENT : c.line, backgroundColor: agree ? STYLE_ACCENT : "transparent", alignItems: "center", justifyContent: "center" }}>{agree && <Icon name="check" size={16} color="#FFF" />}</View>
          <T v="callout" style={{ flex: 1 }}>I've checked the design, measurements, the total of {inr(total)} and delivery by {by}.</T>
        </Pressable>
        {err ? <Banner tone="alert">{err}</Banner> : null}
        <Button title={`Pay ${inr(total)} securely`} loading={busy} disabled={!agree || !p || address.trim().length < 10} onPress={place} />
      </ScrollView>
    </Screen>
  );
}
