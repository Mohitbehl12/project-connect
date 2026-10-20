import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { EmptyState, ErrorState, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useTheme } from "@/theme/ThemeProvider";

type Item = {
  type: "CALL" | "REQUEST"; id: string; matchId: string; kind: string; at: string; outgoing: boolean; durationSec: number | null; outcome: string;
  with: { userId: string; name: string; photo: string | null };
};
const len = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Call history: calls and call requests with who, when, how long and what happened. */
export default function CallHistory() {
  const { c } = useTheme();
  const q = useQuery({ queryKey: ["call-history"], queryFn: () => api<{ items: Item[] }>("/api/calls/history") });
  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Call history" sub="Calls and call requests. Only you and the other person can see these." />
      {q.isLoading && <View style={{ gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={64} />)}</View>}
      {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && !q.data.items.length && <EmptyState title="No calls yet" body="Ask a match for a call from your chat. You can call once they accept." />}
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(i) => i.type + i.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 30 }}
        renderItem={({ item: i }) => {
          const bad = /Missed|Declined|Dropped/.test(i.outcome);
          const d = new Date(i.at);
          return (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderRadius: 18, padding: 12 }}>
              {i.with.photo ? <Image source={{ uri: i.with.photo }} style={{ width: 46, height: 46, borderRadius: 23 }} /> : <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.raised }} />}
              <Pressable accessibilityRole="button" accessibilityLabel={`Open chat with ${i.with.name}`} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: i.matchId } })} style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name={i.kind === "VIDEO" ? "video" : "call"} size={16} color={bad ? c.alert : c.muted} />
                  <T v="callout" strong>{i.with.name}</T>
                </View>
                <T v="caption" tone={bad ? "alert" : "muted"}>
                  {i.type === "REQUEST" ? `Call request · ${i.outcome}` : `${i.outgoing ? "Outgoing" : "Incoming"} · ${i.outcome}`}{i.durationSec !== null ? ` · ${len(i.durationSec)}` : ""}
                </T>
                <T v="caption" tone="faint">{d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} · {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</T>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Report or block ${i.with.name}`} hitSlop={10}
                onPress={() => router.push({ pathname: "/report", params: { userId: i.with.userId, name: i.with.name } })} style={{ padding: 6 }}>
                <Icon name="flag" size={20} color={c.muted} />
              </Pressable>
            </View>
          );
        }}
      />
    </Screen>
  );
}
