import { INTERESTS, INTEREST_EMOJI } from "@shared/constants";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { CompatArc } from "@/components/Arc";
import { Header } from "@/components/Header";
import { VerifiedBadge } from "@/components/Icon";
import { T } from "@/components/Text";
import { EmptyState, ErrorState, PhotoView, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { cardCache } from "@/lib/cardCache";
import type { Card } from "@/lib/types";

const TITLES: Record<string, [string, string]> = {
  verified: ["Verified only", "People who completed a selfie check"],
  new: ["New this week", "Say hi before everyone else does"],
  intent: ["Same goals", "Looking for the same kind of relationship"],
  compatibility: ["Personality match", "Similar outlook and pace"],
  nearby: ["Close by", "Nearest first — distances are approximate"],
};

export default function ExploreList() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { width } = useWindowDimensions();
  const interest = key?.startsWith("i:") ? key.slice(2) : null;
  const query = interest ? `mode=recommended&interest=${interest}` : key === "verified" ? "mode=recommended&verified=1" : `mode=${key}`;
  const q = useQuery({ queryKey: ["explore", key], queryFn: () => api<{ cards: Card[] }>(`/api/discovery?${query}`) });
  useEffect(() => { if (q.data) cardCache.put(q.data.cards); }, [q.data]);
  const [title, sub] = interest ? [`${INTEREST_EMOJI[interest] ?? ""} ${INTERESTS[interest] ?? interest}`, "People who share this interest"] : TITLES[key ?? ""] ?? ["Explore", ""];
  const w = (width - 40 - 12) / 2;

  return (
    <Screen>
      <Header title={title} sub={sub} />
      {q.isLoading && <View style={{ flexDirection: "row", gap: 12 }}><Skeleton w={w} h={w * 1.35} r={22} /><Skeleton w={w} h={w * 1.35} r={22} /></View>}
      {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && !q.data.cards.length && (
        <EmptyState art="door" title="No one here right now" body="Your next great connection might be just around the corner. Try another collection or widen your preferences." action={{ label: "Explore more", onPress: () => router.back() }} />
      )}
      {!!q.data?.cards.length && (
        <FlatList data={q.data.cards} numColumns={2} columnWrapperStyle={{ gap: 12 }} contentContainerStyle={{ gap: 12, paddingBottom: 24 }} keyExtractor={(cd) => cd.id}
          renderItem={({ item: cd }) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`${cd.firstName}, ${cd.age}, ${cd.score} percent compatible`} onPress={() => router.push({ pathname: "/profile/[id]", params: { id: cd.id } })}
              style={{ width: w, height: w * 1.35, borderRadius: 22, overflow: "hidden" }}>
              <PhotoView photo={cd.photos[0]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any} />
              {cd.score !== undefined && <View style={{ position: "absolute", top: 8, right: 8, borderRadius: 30, padding: 3, backgroundColor: "rgba(22,17,42,0.4)" }}><CompatArc score={cd.score} size={40} onDark /></View>}
              <LinearGradient colors={["transparent", "rgba(22,17,42,0.9)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, paddingTop: 36 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <T v="headline" tone="white" numberOfLines={1} style={{ flexShrink: 1 }}>{cd.firstName}, {cd.age}</T>
                  {cd.verified && <VerifiedBadge size={16} />}
                </View>
                <T v="caption" tone="white" style={{ opacity: 0.85 }} numberOfLines={1}>{cd.city} · {cd.distance}</T>
              </LinearGradient>
            </Pressable>
          )} />
      )}
    </Screen>
  );
}
