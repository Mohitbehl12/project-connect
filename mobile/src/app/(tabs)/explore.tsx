import { INTERESTS } from "@shared/constants";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Aurora } from "@/components/Ambient";
import { CompatArc } from "@/components/Arc";
import { CardAction, ChemistryPill, CollectionCard, Particles, SectionTitle } from "@/components/ExploreKit";
import { VerifiedBadge } from "@/components/Icon";
import { InterestTile } from "@/components/InterestTile";
import { LuxIcon } from "@/components/LuxIcon";
import { SponsoredSlot, SponsoredStoryTile } from "@/components/Sponsored";
import { T } from "@/components/Text";
import { Banner, PhotoView, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cardCache } from "@/lib/cardCache";
import { MOMENTS, celebrate } from "@/lib/fx";
import { haptic } from "@/lib/haptics";
import type { Card } from "@/lib/types";
import { alpha } from "@/theme/themes";
import { useTheme } from "@/theme/ThemeProvider";

type Home = {
  total: number;
  categories: { key: string; title: string; sub: string; emoji: string; count: number; label: string }[];
  interests: { key: string; label: string; count: number; label2: string }[];
  forYou: Card[];
};

const MORE = ["travel", "music_live", "food_trails", "coffee", "films", "gym", "art", "photography", "fashion", "dance", "beach", "nightlife", "dogs", "gaming", "reading", "wine"];
const open = (key: string) => { haptic.tick(); router.push({ pathname: "/explore/[key]", params: { key } }); };

export default function Explore() {
  const { c, g, dark } = useTheme();
  const { me } = useAuth();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const q = useQuery({ queryKey: ["explore-home"], queryFn: () => api<Home>("/api/explore"), staleTime: 2 * 60_000 });
  const [gone, setGone] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ tone: "warn" | "alert" | "trust"; text: string; premium?: boolean } | null>(null);
  useEffect(() => { if (q.data) cardCache.put(q.data.forYou); }, [q.data]);
  const forYou = (q.data?.forYou ?? []).filter((x) => !gone.includes(x.id));
  const cats = (q.data?.categories ?? []).filter((x) => x.count > 0);
  const colW = (Math.min(width, 760) - 40 - 12) / 2;
  const mine = (me?.profile?.interests ?? "").split(",").filter(Boolean);
  const tileW = (Math.min(width, 760) - 40 - 20) / 3;

  async function act(card: Card, kind: "LIKE" | "SPARK") {
    if (kind === "LIKE") { celebrate(MOMENTS.like); haptic.medium(); } else celebrate(MOMENTS.spark);
    setGone((x) => [...x, card.id]);
    try {
      const r = await api<{ matched: boolean; matchId: string | null }>("/api/likes", { body: { toId: card.id, kind } });
      if (r.matched && r.matchId) { haptic.success(); qc.invalidateQueries({ queryKey: ["matches"] }); router.push({ pathname: "/match", params: { matchId: r.matchId, userId: card.id } }); }
      else setNotice({ tone: "trust", text: kind === "SPARK" ? `Spark sent to ${card.firstName} ✨` : `You liked ${card.firstName} ❤️` });
    } catch (e: any) {
      setGone((x) => x.filter((id) => id !== card.id));
      haptic.warning();
      setNotice({ tone: e.code === "daily_limit" ? "warn" : "alert", text: e.message, premium: e.code === "daily_limit" });
    }
  }

  return (
    <Screen pad={false} ambient="top">
      <ScrollView contentContainerStyle={{ paddingBottom: 36, gap: 26 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { setGone([]); q.refetch(); }} tintColor={c.brand} />}>
        <View style={{ paddingHorizontal: 20, paddingTop: 6, gap: 14 }}>
          <View>
            <T v="title" style={{ fontFamily: "BricolageGrotesque_800ExtraBold" }}>Explore ✨</T>
            <T tone="muted">Discover people, interests and connections that match your vibe.</T>
          </View>
          {/* Search: opens the full-screen filter panel. */}
          <Pressable accessibilityRole="search" accessibilityLabel="Search. Who are you hoping to discover?" onPress={() => { haptic.tick(); router.push("/search"); }}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, height: 54, borderRadius: 27, paddingHorizontal: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: alpha(c.accent, dark ? 0.35 : 0.5), opacity: pressed ? 0.85 : 1, shadowColor: g.sunset[0], shadowOpacity: dark ? 0.25 : 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } })}>
            <LuxIcon name="search" size={22} color={c.muted} />
            <T tone="muted" style={{ flex: 1 }} numberOfLines={1}>Who are you hoping to discover? ✨</T>
            <LuxIcon name="lifestyle" size={20} color={c.faint} />
          </Pressable>
        </View>

        {notice && (
          <View style={{ paddingHorizontal: 12, marginTop: -12 }}>
            <Banner tone={notice.tone} onPress={notice.premium ? () => router.push("/premium") : () => setNotice(null)}><T v="callout">{notice.text}{notice.premium ? "  See Premium" : ""}</T></Banner>
          </View>
        )}

        {/* Hero */}
        <View style={{ paddingHorizontal: 20 }}>
          <View style={{ borderRadius: 30, overflow: "hidden", minHeight: 190, borderWidth: 1, borderColor: "rgba(233,195,122,0.35)" }}>
            <LinearGradient colors={[g.night, "#3A0B22", "#5B1240"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Aurora variant="full" />
            <Particles />
            <View style={{ padding: 20, gap: 12, flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1, gap: 8 }}>
                {q.isLoading ? <Skeleton h={60} r={14} /> : forYou.length ? (
                  <>
                    <T v="caption" strong style={{ color: "#E9C37A", letterSpacing: 1.4 }}>TONIGHT'S DISCOVERIES</T>
                    <T v="title" tone="white" style={{ fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 25, lineHeight: 29 }}>{q.data!.total} {q.data!.total === 1 ? "person matches" : "people match"} your vibe</T>
                    <Pressable accessibilityRole="button" onPress={() => open("recommended")} style={{ alignSelf: "flex-start", marginTop: 4, borderRadius: 999, overflow: "hidden" }}>
                      <LinearGradient colors={[g.sunset[0], g.sunset[2]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 18, paddingVertical: 10 }}>
                        <T v="callout" strong tone="white">See who's here →</T>
                      </LinearGradient>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <T v="title" tone="white" style={{ fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 23, lineHeight: 28 }}>Your next connection might be around the corner. ✨</T>
                    <Pressable accessibilityRole="button" onPress={() => { setGone([]); q.refetch(); }} style={{ alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", paddingHorizontal: 16, paddingVertical: 9 }}>
                      <T v="callout" strong tone="white">Explore Again</T>
                    </Pressable>
                  </>
                )}
              </View>
              {forYou.length > 0 && (
                <View style={{ width: 104, height: 120 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {forYou.slice(0, 3).map((p, i) => (
                    <View key={p.id} style={{ position: "absolute", left: i * 26, top: i % 2 ? 26 : 0, width: 62, height: 84, borderRadius: 18, overflow: "hidden", borderWidth: 2, borderColor: i === 1 ? "#E9C37A" : "rgba(255,255,255,0.6)", transform: [{ rotate: `${(i - 1) * 7}deg` }] }}>
                      <PhotoView photo={p.photos[0]} style={StyleSheet.absoluteFill as any} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Made For You */}
        {(q.isLoading || forYou.length > 0) && (
          <View style={{ gap: 12 }}>
            <SectionTitle title="Made For You ✨" sub="Based on your interests, goals, city and preferences" right={<Pressable accessibilityRole="button" onPress={() => open("recommended")}><T v="callout" strong tone="brand">See all</T></Pressable>} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 20, alignItems: "center" }}>
              {q.isLoading && [0, 1].map((i) => <Skeleton key={i} w={232} h={330} r={28} />)}
              {forYou.map((p, i) => <ForYouCard key={p.id} p={p} index={i} onAct={act} />)}
              <SponsoredStoryTile />
            </ScrollView>
            <T v="caption" tone="faint" style={{ paddingHorizontal: 20 }}>Chemistry is our estimate from your answers, interests and preferences — a starting point, not a guarantee.</T>
          </View>
        )}

        {/* Collections */}
        <View style={{ gap: 12 }}>
          <SectionTitle title="Explore collections" sub="Real people, counted live" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 20 }}>
            {q.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} w={colW} h={188} r={26} />)}
            {cats.map((cat, i) => (
              <Animated.View key={cat.key} entering={FadeInDown.delay(Math.min(i, 6) * 40).duration(300)}>
                <CollectionCard k={cat.key} title={cat.title} emoji={cat.emoji} sub={cat.sub} label={cat.label} width={colW} onPress={() => open(cat.key)} />
              </Animated.View>
            ))}
          </View>
          {q.data && !cats.length && (
            <View style={{ marginHorizontal: 20, padding: 20, borderRadius: 24, backgroundColor: c.surface, gap: 8, alignItems: "center" }}>
              <T v="headline" center>Your next connection might be around the corner. ✨</T>
              <T tone="muted" center>New people join every day. Widen your age range or distance to see more.</T>
              <Pressable accessibilityRole="button" onPress={() => router.push("/preferences")}><T v="callout" strong tone="brand">Adjust preferences</T></Pressable>
            </View>
          )}
        </View>

        <SponsoredSlot placement="FEED" style={{ paddingHorizontal: 20 }} />

        {/* Your interests */}
        <View style={{ gap: 12 }}>
          <SectionTitle title="Your Interests ❤️" sub="Tap one to meet people who share it" right={<Pressable accessibilityRole="button" onPress={() => router.push("/edit-profile")}><T v="callout" strong tone="brand">Edit</T></Pressable>} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 20 }}>
            {(q.data?.interests ?? []).map((i) => <InterestTile key={i.key} k={i.key} width={tileW} selected={false} sub={i.label2} onPress={() => open(`i:${i.key}`)} />)}
            {q.data && !q.data.interests.length && (
              <Pressable accessibilityRole="button" onPress={() => router.push("/edit-profile")} style={{ flex: 1, padding: 18, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 4 }}>
                <T v="headline">Add a few interests ✨</T>
                <T tone="muted">They're the easiest way to start a conversation.</T>
              </Pressable>
            )}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <SectionTitle title="Discover more passions" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingVertical: 8 }}>
            {MORE.filter((k) => !mine.includes(k) && INTERESTS[k]).slice(0, 10).map((k) => <InterestTile key={k} k={k} width={108} selected={false} onPress={() => open(`i:${k}`)} />)}
          </ScrollView>
        </View>

        <SponsoredSlot placement="RECOMMENDATION" after="FEED" compact style={{ paddingHorizontal: 20 }} />
      </ScrollView>
    </Screen>
  );
}

/** "Made For You" profile card: photo, name, age, city, interests, chemistry, and Like / Spark / View. */
function ForYouCard({ p, index, onAct }: { p: Card; index: number; onAct: (p: Card, k: "LIKE" | "SPARK") => void }) {
  const tags = [...p.shared.map((s) => s.label), ...p.interests.filter((x) => !p.shared.some((s) => s.label === x))].slice(0, 2);
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 4) * 60).duration(320)}
      style={{ width: 232, height: 330, borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: "rgba(233,195,122,0.3)", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${p.firstName}, ${p.age}, ${p.city}. View profile`} onPress={() => router.push({ pathname: "/profile/[id]", params: { id: p.id } })} style={StyleSheet.absoluteFill}>
        <PhotoView photo={p.photos[0]} style={StyleSheet.absoluteFill as any} />
      </Pressable>
      {p.score !== undefined && (
        <View pointerEvents="none" style={{ position: "absolute", top: 10, right: 10, borderRadius: 40, padding: 4, backgroundColor: "rgba(15,7,9,0.45)" }}>
          <CompatArc score={p.score} size={58} onDark caption="Chemistry" />
        </View>
      )}
      <LinearGradient pointerEvents="box-none" colors={["transparent", "rgba(15,7,9,0.55)", "rgba(15,7,9,0.94)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, paddingTop: 60, gap: 6 }}>
        <ChemistryPill label={p.chemistry} onDark />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <T v="headline" tone="white" numberOfLines={1} style={{ fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 21, lineHeight: 25, flexShrink: 1 }}>{p.firstName}, {p.age}</T>
          {p.verified && <VerifiedBadge size={17} />}
        </View>
        <T v="caption" tone="white" style={{ opacity: 0.8 }} numberOfLines={1}>{p.city}</T>
        {tags.length > 0 && (
          <View style={{ flexDirection: "row", gap: 6 }}>
            {tags.map((t) => <View key={t} style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "rgba(255,255,255,0.14)" }}><T v="caption" tone="white" numberOfLines={1} style={{ fontSize: 11.5 }}>{t}</T></View>)}
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 4, alignItems: "center" }}>
          <CardAction icon="heart" label={`Like ${p.firstName}`} primary onPress={() => onAct(p, "LIKE")} />
          <CardAction icon="spark" label={`Send ${p.firstName} a Spark`} onPress={() => onAct(p, "SPARK")} />
          <CardAction icon="eye" label={`View ${p.firstName}'s profile`} onPress={() => router.push({ pathname: "/profile/[id]", params: { id: p.id } })} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}
