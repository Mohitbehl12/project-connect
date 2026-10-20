import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { inr } from "@shared/style/darzi.js";
import { T } from "@/components/Text";
import { EmptyState, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { GarmentView } from "@/style/GarmentView";
import { STYLE_ACCENT, StyleHeader } from "@/style/StyleHeader";
import type { StyleOrder } from "@/style/types";
import { useTheme } from "@/theme/ThemeProvider";

export function Progress({ o }: { o: StyleOrder }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 3 }} accessibilityLabel={`Step ${o.status + 1} of ${o.statuses.length}: ${o.statusLabel}`}>
      {o.statuses.map((s, i) => <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: o.paymentStatus === "PENDING" ? c.line : i <= o.status ? STYLE_ACCENT : c.line }} />)}
    </View>
  );
}

export default function Orders() {
  const { c } = useTheme();
  const q = useQuery({ queryKey: ["style-orders"], queryFn: () => api<{ orders: StyleOrder[] }>("/api/style/orders"), refetchInterval: 30_000 });
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
        <StyleHeader title="Your orders" sub="Every step from design to your door." />
        {q.data && !q.data.orders.length && <EmptyState title="No orders yet" body="Design something in Design, add measurements, and it'll show up here." action={{ label: "Start designing", onPress: () => router.push("/style/design") }} />}
        {q.data?.orders.map((o) => (
          <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`Order ${o.id}, ${o.garment}, ${o.paymentStatus === "PENDING" ? "waiting for payment" : o.statusLabel}`}
            onPress={() => router.push({ pathname: "/style/orders/[id]", params: { id: o.id } })} style={{ flexDirection: "row", gap: 12, backgroundColor: c.surface, borderRadius: 20, padding: 12 }}>
            <GarmentView spec={o.spec} size={76} />
            <View style={{ flex: 1, gap: 4 }}>
              <T v="callout" strong>{o.garment} · {o.id}</T>
              <T v="caption" tone="muted">For {o.profileName} · {inr(o.priceMinor / 100)}</T>
              <T v="caption" style={{ color: o.paymentStatus === "PENDING" ? c.alert : STYLE_ACCENT }}>{o.paymentStatus === "PENDING" ? "Waiting for payment" : o.statusLabel}{o.paymentStatus === "TEST_PAID" ? " · test payment" : ""}</T>
              <Progress o={o} />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}
