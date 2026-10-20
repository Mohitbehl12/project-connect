import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { inr } from "@shared/style/darzi.js";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { Banner, Chip, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { GarmentView } from "@/style/GarmentView";
import { STYLE_ACCENT, StyleHeader } from "@/style/StyleHeader";
import type { StyleOrder } from "@/style/types";
import { useTheme } from "@/theme/ThemeProvider";

export default function OrderDetail() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["style-order", id], queryFn: () => api<{ order: StyleOrder }>(`/api/style/orders/${id}`), refetchInterval: 15_000 });
  const o = q.data?.order;
  const [fit, setFit] = useState<"PERFECT" | "TIGHT" | "LOOSE">("PERFECT");
  const [rating, setRating] = useState(5);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  if (!o) return <Screen><StyleHeader title="Order" back /><T tone="muted">{q.isLoading ? "Loading…" : "Order not found."}</T></Screen>;
  const delivered = o.status === o.statuses.length - 1;
  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
        <StyleHeader title={`Order ${o.id}`} sub={o.description} back />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <GarmentView spec={o.spec} size={130} />
          <View style={{ flex: 1, gap: 6 }}>
            <T v="headline" style={{ color: STYLE_ACCENT }}>{inr(o.priceMinor / 100)}</T>
            <T v="callout">For {o.profileName}</T>
            {o.fitLocked && <T v="caption" tone="trust">Fit Locked — free alteration or remake</T>}
            {o.eta && o.paymentStatus !== "PENDING" && <T v="callout" tone="muted">Expected by {new Date(o.eta).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</T>}
            {o.paymentStatus === "TEST_PAID" && <T v="caption" tone="faint">Test payment — no money was taken.</T>}
          </View>
        </View>
        {o.paymentStatus === "PENDING" && o.payUrl && (
          <View style={{ gap: 8 }}>
            <Banner tone="warn">Waiting for payment. Your order starts once it's paid.</Banner>
            <Button title={`Pay ${inr(o.priceMinor / 100)} securely`} onPress={async () => { await WebBrowser.openBrowserAsync(o.payUrl!).catch(() => {}); q.refetch(); qc.invalidateQueries({ queryKey: ["style-orders"] }); }} />
          </View>
        )}
        <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 14, gap: 10 }}>
          <T v="headline">Progress</T>
          {o.statuses.map((s, i) => {
            const done = o.paymentStatus !== "PENDING" && i <= o.status;
            const ev = o.events?.filter((e) => e.status === i).pop();
            return (
              <View key={s} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: done ? STYLE_ACCENT : c.raised, alignItems: "center", justifyContent: "center" }}><T v="caption" style={{ color: done ? "#FFF" : c.faint }}>{done ? "✓" : i + 1}</T></View>
                <View style={{ flex: 1 }}><T v="callout" strong={i === o.status && done}>{s}</T>{ev && done ? <T v="caption" tone="muted">{new Date(ev.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{ev.note ? ` · ${ev.note}` : ""}</T> : null}</View>
              </View>
            );
          })}
        </View>
        {o.finished && (
          <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 14, gap: 4 }}>
            <T v="callout" strong>Finished garment (inches)</T>
            {o.finished.map(([l, v]) => <View key={l} style={{ flexDirection: "row", justifyContent: "space-between" }}><T v="callout" tone="muted">{l}</T><T v="callout">{v.toFixed(1)}</T></View>)}
          </View>
        )}
        {delivered && (o.feedback ? (
          <Banner tone="trust">Thanks for telling us how it fits ({o.feedback.fit.toLowerCase()}, {o.feedback.rating}/5).</Banner>
        ) : (
          <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 14, gap: 10 }}>
            <T v="headline">How does it fit?</T>
            <View style={{ flexDirection: "row", gap: 8 }}>{(["PERFECT", "TIGHT", "LOOSE"] as const).map((f) => <Chip key={f} label={f === "PERFECT" ? "Perfect" : f === "TIGHT" ? "A bit tight" : "A bit loose"} selected={fit === f} onPress={() => setFit(f)} />)}</View>
            <View style={{ flexDirection: "row", gap: 6 }}>{[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={"★".repeat(n)} selected={rating === n} onPress={() => setRating(n)} />)}</View>
            <TextInput value={note} onChangeText={setNote} placeholder="Anything else? (optional)" accessibilityLabel="Fit feedback" placeholderTextColor={c.faint} style={{ borderRadius: 14, backgroundColor: c.raised, padding: 12, fontSize: 16, color: c.text }} />
            {msg ? <T v="caption" tone="alert">{msg}</T> : null}
            <Button title="Send" onPress={async () => { try { await api(`/api/style/orders/${o.id}/feedback`, { body: { fit, rating, note } }); q.refetch(); } catch (e: any) { setMsg(e.message); } }} />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
