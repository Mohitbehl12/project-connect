import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect } from "react";
import { FlatList, Pressable, RefreshControl, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon, VerifiedBadge } from "@/components/Icon";
import { T } from "@/components/Text";
import { EmptyState, ErrorState, PhotoView, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { cardCache } from "@/lib/cardCache";
import type { Card } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";

type Likes = { total: number; cards: Card[]; hidden: number; locked: { blurhash: string | null }[]; canSeeAll: boolean };
type Cell = { kind: "card"; card: Card } | { kind: "locked"; blurhash: string | null; i: number };

export default function LikesScreen() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["likes"], queryFn: () => api<Likes>("/api/likes") });
  useEffect(() => { if (q.data) cardCache.put(q.data.cards); }, [q.data]);
  const w = (width - 20 * 2 - 12) / 2;
  const cells: Cell[] = [
    ...(q.data?.cards ?? []).map((card) => ({ kind: "card" as const, card })),
    ...(q.data?.locked ?? []).map((l, i) => ({ kind: "locked" as const, blurhash: l.blurhash, i })),
  ];

  return (
    <Screen>
      <Header title="Likes you" sub={q.data?.total ? `${q.data.total} ${q.data.total === 1 ? "person likes" : "people like"} you` : "People who like you show up here"} />
      {q.isLoading && <View style={{ flexDirection: "row", gap: 12 }}><Skeleton w={w} h={w * 1.35} r={22} /><Skeleton w={w} h={w * 1.35} r={22} /></View>}
      {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && q.data.total === 0 && (
        <EmptyState art="bench" title="Keep exploring" body="Your next connection may be around the corner. A complete, verified profile gets noticed sooner."
          action={{ label: "Improve my profile", onPress: () => router.push("/edit-profile") }} />
      )}
      {q.data && q.data.total > 0 && (
        <FlatList
          data={cells}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          keyExtractor={(cell) => (cell.kind === "card" ? cell.card.id : `locked-${cell.i}`)}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); qc.invalidateQueries({ queryKey: ["me"] }); }} tintColor={c.brand} />}
          ListHeaderComponent={q.data.hidden > 0 ? (
            <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 16, gap: 8, marginBottom: 4 }}>
              <T v="headline">{q.data.hidden} {q.data.hidden === 1 ? "person is" : "people are"} waiting</T>
              <T tone="muted">Keep discovering — if they liked you, you'll match the moment you like them. Or see everyone now with Premium.</T>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <Button title="Keep discovering" v="outline" onPress={() => router.push("/discover")} style={{ flex: 1 }} />
                <Button title="See who" v="primary" icon="sparkle" onPress={() => router.push("/premium")} style={{ flex: 1 }} />
              </View>
            </View>
          ) : null}
          renderItem={({ item: cell }) => cell.kind === "card" ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${cell.card.firstName}, ${cell.card.age}${cell.card.likeKind === "PRIORITY" ? ", sent you a Super Like" : cell.card.likeKind === "SPARK" ? ", sent you a Spark" : ""}`}
              onPress={() => router.push({ pathname: "/profile/[id]", params: { id: cell.card.id } })} style={{ width: w, height: w * 1.35, borderRadius: 22, overflow: "hidden" }}>
              <PhotoView photo={cell.card.photos[0]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any} />
              <LinearGradient colors={["transparent", "rgba(15,7,9,0.9)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, paddingTop: 40 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <T v="headline" tone="white" numberOfLines={1} style={{ flexShrink: 1 }}>{cell.card.firstName}, {cell.card.age}</T>
                  {cell.card.verified && <VerifiedBadge size={16} />}
                </View>
                <T v="caption" tone="white" style={{ opacity: 0.8 }}>{cell.card.score}% compatible</T>
              </LinearGradient>
              {(cell.card.likeKind === "PRIORITY" || cell.card.likeKind === "SPARK") && (
                <View style={{ position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <T v="caption" style={{ color: c.accentText, fontFamily: "Figtree_700Bold" }}>{cell.card.likeKind === "SPARK" ? "Spark ✨" : "Super Like ⭐"}</T>
                </View>
              )}
            </Pressable>
          ) : (
            <View accessible accessibilityLabel="Someone who likes you. Hidden on the free plan." style={{ width: w, height: w * 1.35, borderRadius: 22, overflow: "hidden", backgroundColor: c.raised }}>
              {cell.blurhash && <Image placeholder={{ blurhash: cell.blurhash }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any} />}
              <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(22,17,42,0.25)" }}>
                <Icon name="lock" color="#FFF" size={26} />
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
