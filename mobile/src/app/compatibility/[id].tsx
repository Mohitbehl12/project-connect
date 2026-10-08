import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { CompatArc } from "@/components/Arc";
import { T } from "@/components/Text";
import { ErrorState, Screen, SheetHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { cardCache } from "@/lib/cardCache";
import type { Compatibility } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";
import { Bars } from "@/components/CompatBars";

export default function CompatibilityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const card = cardCache.get(id);
  const q = useQuery({ queryKey: ["compat", id], queryFn: () => api<Compatibility>(`/api/compatibility/${id}`) });

  return (
    <Screen edges={["top", "bottom"]} pad={false}>
      <SheetHeader title={card ? `You and ${card.firstName}` : "Compatibility"} onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 28 }}>
        {q.isLoading && <Skeleton h={320} r={24} />}
        {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && (
          <>
            <View style={{ alignItems: "center", gap: 10 }}>
              <CompatArc score={q.data.overall} size={168} />
              <T v="title" center>{q.data.overall >= 80 ? "A strong fit" : q.data.overall >= 65 ? "A promising fit" : "Different in interesting ways"}</T>
            </View>
            <View style={{ backgroundColor: c.surface, borderRadius: 24, padding: 18 }}><Bars data={q.data} /></View>
            {q.data.reasons.length > 0 && (
              <View style={{ gap: 10 }}>
                <T v="headline">What you share</T>
                {q.data.reasons.map((r) => <T key={r}>✓  {r}</T>)}
                {q.data.connect.map((r) => <T key={r}>✓  {r}</T>)}
              </View>
            )}
            <T v="caption" tone="faint">Scores show how your answers line up. Chemistry is up to you.</T>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
