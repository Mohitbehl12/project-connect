import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect } from "react";
import { Icon } from "@/components/Icon";
import { cardCache } from "@/lib/cardCache";
import type { Card } from "@/lib/types";
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

type Likes = { total: number; cards: Card[]; hidden: number; locked: { blurhash: string | null }[]; canSeeAll: boolean };

/** "Likes you" lives at the top of Matches: faces for Premium, soft blurs (with the count) on Free. */
function LikesStrip() {
  const { c, g } = useTheme();
  const q = useQuery({ queryKey: ["likes"], queryFn: () => api<Likes>("/api/likes") });
  useEffect(() => { if (q.data) cardCache.put(q.data.cards); }, [q.data]);
  const total = q.data?.total ?? 0;
  if (!q.data) return <Skeleton h={92} r={22} />;
  const faces = [...q.data.cards.slice(0, 4).map((cd) => ({ key: cd.id, photo: cd.photos[0], blur: null as string | null })), ...q.data.locked.slice(0, Math.max(0, 4 - q.data.cards.length)).map((l, i) => ({ key: `l${i}`, photo: undefined, blur: l.blurhash }))];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={total ? `${total} people like you. See all.` : "Likes you. Nobody yet."} onPress={() => router.push("/likes")}
      style={{ borderRadius: 24, overflow: "hidden", marginBottom: 14 }}>
      <LinearGradient colors={total ? [g.spark, g.sunset[1], g.sunset[2]] : [c.surface, c.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14 }}>
        <View style={{ flexDirection: "row" }}>
          {total ? faces.map((f, i) => (
            <View key={f.key} style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: "#FFF", marginLeft: i ? -16 : 0, overflow: "hidden", backgroundColor: c.raised }}>
              {f.photo ? <PhotoView photo={f.photo} style={{ flex: 1 }} /> : f.blur ? <Image placeholder={{ blurhash: f.blur }} style={{ flex: 1 }} /> : null}
            </View>
          )) : <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.raised, alignItems: "center", justifyContent: "center" }}><Icon name="likes" color={c.faint} /></View>}
        </View>
        <View style={{ flex: 1 }}>
          <T v="headline" tone={total ? "white" : undefined}>{total ? `${total} ${total === 1 ? "person likes" : "people like"} you` : "Likes you"}</T>
          <T v="caption" tone={total ? "white" : "muted"} style={{ opacity: total ? 0.92 : 1 }}>{total ? (q.data.canSeeAll ? "Tap to see who" : "Like them back in Discover — or see who with Premium") : "When someone likes you, they'll show up here."}</T>
        </View>
        {total ? <Icon name="forward" color="#FFF" /> : null}
      </LinearGradient>
    </Pressable>
  );
}

/** New matches you haven't talked to yet, with their compatibility, as a photo grid. */
export default function MatchesTab() {
  const { c, g } = useTheme();
  const { width } = useWindowDimensions();
  const q = useQuery({ queryKey: ["matches"], queryFn: () => api<{ matches: MatchRow[] }>("/api/matches") });
  const fresh = (q.data?.matches ?? []).filter((m) => !m.lastMessage);
  const talking = (q.data?.matches ?? []).filter((m) => m.lastMessage).slice(0, 6);
  const w = (width - 40 - 12) / 2;

  return (
    <Screen ambient="top">
      <View style={{ paddingTop: 6, paddingBottom: 12 }}>
        <T v="title">Matches</T>
        <T v="caption" tone="muted">{fresh.length ? `${fresh.length} waiting for a hello` : "Everyone you've matched with"}</T>
      </View>
      <LikesStrip />
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
              <View style={{ position: "absolute", top: 8, right: 8, borderRadius: 30, padding: 4, backgroundColor: "rgba(22,17,42,0.4)" }}><CompatArc score={m.score} size={44} onDark /></View>
              <LinearGradient colors={["transparent", "rgba(22,17,42,0.9)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, paddingTop: 36 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <T v="headline" tone="white" numberOfLines={1} style={{ flexShrink: 1 }}>{m.other.firstName}</T>
                  {m.other.verified && <VerifiedBadge size={16} />}
                </View>
                <T v="caption" style={{ color: g.spark }}>Say hello</T>
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
