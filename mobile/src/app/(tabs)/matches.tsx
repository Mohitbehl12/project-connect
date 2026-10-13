import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CompatArc } from "@/components/Arc";
import { VerifiedBadge } from "@/components/Icon";
import { T } from "@/components/Text";
import { EmptyState, ErrorState, PhotoView, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import type { MatchRow } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";

/** New matches you haven't talked to yet, with their compatibility, as a photo grid. */
export default function MatchesTab() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const q = useQuery({ queryKey: ["matches"], queryFn: () => api<{ matches: MatchRow[] }>("/api/matches") });
  const fresh = (q.data?.matches ?? []).filter((m) => !m.lastMessage);
  const talking = (q.data?.matches ?? []).filter((m) => m.lastMessage).slice(0, 6);
  const w = (width - 40 - 12) / 2;

  return (
    <Screen>
      <View style={{ paddingTop: 6, paddingBottom: 12 }}>
        <T v="title">Matches</T>
        <T v="caption" tone="muted">{fresh.length ? `${fresh.length} waiting for a hello` : "Everyone you've matched with"}</T>
      </View>
      {q.isLoading && <Skeleton h={w * 1.3} r={22} />}
      {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && !q.data.matches.length && (
        <EmptyState art="cups" title="No matches yet" body="Your next great conversation could be one discovery away." action={{ label: "Start discovering", onPress: () => router.push("/discover") }} />
      )}
      {q.data && q.data.matches.length > 0 && (
        <FlatList
          data={fresh}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          keyExtractor={(m) => m.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={c.brand} />}
          ListEmptyComponent={<T tone="muted">You've said hello to all your matches. Nice.</T>}
          renderItem={({ item: m }) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`${m.other.firstName}, ${m.score} percent compatible. Say hello.`}
              onPress={() => router.push({ pathname: "/chat/[id]", params: { id: m.id } })} style={{ width: w, height: w * 1.3, borderRadius: 22, overflow: "hidden" }}>
              <PhotoView photo={m.other.photo} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any} />
              <View style={{ position: "absolute", top: 8, right: 8, borderRadius: 30, padding: 4, backgroundColor: "rgba(18,17,42,0.4)" }}><CompatArc score={m.score} size={44} onDark /></View>
              <LinearGradient colors={["transparent", "rgba(18,17,42,0.9)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, paddingTop: 36 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <T v="headline" tone="white" numberOfLines={1} style={{ flexShrink: 1 }}>{m.other.firstName}</T>
                  {m.other.verified && <VerifiedBadge size={16} />}
                </View>
                <T v="caption" style={{ color: "#F5B656" }}>Say hello</T>
              </LinearGradient>
            </Pressable>
          )}
          ListFooterComponent={talking.length ? (
            <View style={{ gap: 10, marginTop: 20 }}>
              <T v="headline">Recent conversations</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                {talking.map((m) => (
                  <Pressable key={m.id} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: m.id } })} accessibilityRole="button" accessibilityLabel={`Chat with ${m.other.firstName}`} style={{ alignItems: "center", gap: 4, width: 64 }}>
                    <PhotoView photo={m.other.photo} rounded={30} style={{ width: 60, height: 60 }} />
                    <T v="caption" numberOfLines={1}>{m.other.firstName}</T>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        />
      )}
    </Screen>
  );
}
