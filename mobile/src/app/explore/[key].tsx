import { EXPLORE_CATEGORIES, INTERESTS } from "@shared/constants";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { CompatArc } from "@/components/Arc";
import { ChemistryPill } from "@/components/ExploreKit";
import { Header } from "@/components/Header";
import { VerifiedBadge } from "@/components/Icon";
import { LuxIcon } from "@/components/LuxIcon";
import { T } from "@/components/Text";
import { ErrorState, PhotoView, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { cardCache } from "@/lib/cardCache";
import type { Card } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";

const LEGACY: Record<string, [string, string, string]> = {
  verified: ["Verified only", "People who completed a selfie check", "verified=1"],
  intent: ["Same goals", "Looking for the same kind of relationship", "mode=intent"],
  compatibility: ["Personality match", "Similar outlook and pace", "mode=compatibility"],
  nearby: ["Close by", "Nearest first — distances are approximate", "mode=nearby"],
};

/** A collection (?cat=), one interest (i:key), a search (s:query) or an older collection key. */
function resolve(key: string): { title: string; sub: string; qs: string; search?: boolean } {
  if (key.startsWith("i:")) { const k = key.slice(2); return { title: `${INTERESTS[k] ?? k}`, sub: "People who share this interest", qs: `interest=${encodeURIComponent(k)}`, }; }
  if (key.startsWith("s:")) return { title: "Your discoveries ✨", sub: "People matching your search", qs: key.slice(2), search: true };
  const cat = EXPLORE_CATEGORIES.find((c) => c.key === key);
  if (cat) return { title: `${cat.title} ${cat.emoji}`, sub: cat.sub, qs: `cat=${cat.key}` };
  const l = LEGACY[key];
  return l ? { title: l[0], sub: l[1], qs: l[2] } : { title: "Explore ✨", sub: "", qs: "mode=recommended" };
}

export default function ExploreList() {
  const { key = "" } = useLocalSearchParams<{ key: string }>();
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const r = resolve(key);
  const q = useQuery({ queryKey: ["explore", key], queryFn: () => api<{ cards: Card[]; totalAvailable: number }>(`/api/discovery?${r.qs}`) });
  useEffect(() => { if (q.data) cardCache.put(q.data.cards); }, [q.data]);
  const w = (Math.min(width, 760) - 40 - 12) / 2;

  return (
    <Screen>
      <Header title={r.title} sub={q.data ? `${r.sub}${r.sub ? " · " : ""}${q.data.totalAvailable} ${q.data.totalAvailable === 1 ? "person" : "people"}` : r.sub}
        right={key.startsWith("i:") ? <LuxIcon name={key.slice(2)} size={30} active /> : r.search ? <Pressable accessibilityRole="button" accessibilityLabel="Change filters" onPress={() => router.back()}><LuxIcon name="lifestyle" size={26} color={c.text} /></Pressable> : undefined} />
      {q.isLoading && <View style={{ flexDirection: "row", gap: 12 }}><Skeleton w={w} h={w * 1.4} r={24} /><Skeleton w={w} h={w * 1.4} r={24} /></View>}
      {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && !q.data.cards.length && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 }}>
          <LuxIcon name="explore" size={64} active />
          <T v="title" center style={{ fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 24, lineHeight: 30 }}>Your next connection might be around the corner. ✨</T>
          <T tone="muted" center>{r.search ? "Try fewer filters, or a different word." : "New people join every day — check back soon, or explore another collection."}</T>
          <Pressable accessibilityRole="button" onPress={() => (r.search ? router.back() : q.refetch())} style={{ borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
            <LinearGradient colors={["#E8467C", "#7B2FB0"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 22, paddingVertical: 12 }}>
              <T v="callout" strong tone="white">{r.search ? "Change filters" : "Explore Again"}</T>
            </LinearGradient>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.navigate("/explore")}><T v="callout" strong tone="brand">Explore People</T></Pressable>
        </View>
      )}
      {!!q.data?.cards.length && (
        <FlatList data={q.data.cards} numColumns={2} columnWrapperStyle={{ gap: 12 }} contentContainerStyle={{ gap: 12, paddingBottom: 24 }} keyExtractor={(cd) => cd.id}
          renderItem={({ item: cd, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(280)}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${cd.firstName}, ${cd.age}, ${cd.city}${cd.chemistry ? `, ${cd.chemistry.replace(/[^\w ]/g, "").trim()}` : ""}`} onPress={() => router.push({ pathname: "/profile/[id]", params: { id: cd.id } })}
                style={{ width: w, height: w * 1.4, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(233,195,122,0.28)" }}>
                <PhotoView photo={cd.photos[0]} style={StyleSheet.absoluteFill as any} />
                {cd.score !== undefined && <View style={{ position: "absolute", top: 8, right: 8, borderRadius: 30, padding: 3, backgroundColor: "rgba(15,7,9,0.45)" }}><CompatArc score={cd.score} size={44} onDark /></View>}
                <LinearGradient colors={["transparent", "rgba(15,7,9,0.92)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, paddingTop: 40, gap: 4 }}>
                  <ChemistryPill label={cd.chemistry} onDark />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <T v="headline" tone="white" numberOfLines={1} style={{ flexShrink: 1 }}>{cd.firstName}, {cd.age}</T>
                    {cd.verified && <VerifiedBadge size={16} />}
                  </View>
                  <T v="caption" tone="white" style={{ opacity: 0.85 }} numberOfLines={1}>{cd.city} · {cd.distance}</T>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          )} />
      )}
    </Screen>
  );
}
