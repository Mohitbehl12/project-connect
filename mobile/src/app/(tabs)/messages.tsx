import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { VerifiedBadge } from "@/components/Icon";
import { T } from "@/components/Text";
import { EmptyState, ErrorState, PhotoView, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import type { MatchRow } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";

function ago(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(d).toLocaleDateString([], { day: "numeric", month: "short" });
}

export default function MessagesTab() {
  const { c } = useTheme();
  const q = useQuery({ queryKey: ["matches"], queryFn: () => api<{ matches: MatchRow[] }>("/api/matches"), refetchInterval: 15_000 });
  const rows = (q.data?.matches ?? []).filter((m) => m.lastMessage);

  return (
    <Screen pad={false}>
      <View style={{ paddingTop: 6, paddingBottom: 8, paddingHorizontal: 20 }}><T v="title">Messages</T></View>
      {q.isLoading && <View style={{ padding: 20, gap: 16 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={56} />)}</View>}
      {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && !rows.length && (
        <EmptyState art="cups" title="No conversations yet" body="Your matches are waiting to hear from you."
          action={(q.data.matches.length ? { label: "See your matches", onPress: () => router.push("/matches") } : { label: "Start discovering", onPress: () => router.push("/discover") })} />
      )}
      <FlatList
        data={rows}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={c.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.line, marginLeft: 92 }} />}
        renderItem={({ item: m }) => (
          <Pressable accessibilityRole="button"
            accessibilityLabel={`${m.other.firstName}. ${m.lastMessage!.mine ? "You: " : ""}${m.lastMessage!.body}. ${m.unread ? `${m.unread} unread` : ""}`}
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: m.id } })}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: pressed ? c.raised : "transparent" })}>
            <PhotoView photo={m.other.photo} rounded={29} style={{ width: 58, height: 58 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <T v="headline" numberOfLines={1} style={{ flexShrink: 1 }}>{m.other.firstName}</T>
                {m.other.verified && <VerifiedBadge size={15} />}
                <T v="caption" tone="faint" style={{ marginLeft: "auto" }}>{ago(m.lastMessage!.at)}</T>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T v="callout" numberOfLines={1} tone={m.unread ? "text" : "muted"} style={{ flex: 1, fontFamily: m.unread ? "Figtree_700Bold" : "Figtree_500Medium" }}>
                  {m.lastMessage!.mine ? "You: " : ""}{m.lastMessage!.body}
                </T>
                {m.unread > 0 && <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}><T v="caption" style={{ color: c.accentText, fontFamily: "Figtree_700Bold" }}>{m.unread}</T></View>}
              </View>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}
