import { INTEREST_EMOJI, INTERESTS } from "@shared/constants";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Icon, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { Screen } from "@/components/ui";
import { SponsoredSlot, SponsoredStoryTile } from "@/components/Sponsored";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import type { Glow, Palette } from "@/theme/themes";
import { useTheme } from "@/theme/ThemeProvider";

// Ways to browse beyond the main deck. Each opens a filtered list from the same matching engine.
const collections = (c: Palette, g: Glow): { key: string; title: string; sub: string; icon: IconName; g: [string, string] }[] => [
  { key: "verified", title: "Verified only", sub: "Selfie-checked people", icon: "shield", g: [c.trust, "#7FD1B0"] },
  { key: "new", title: "New this week", sub: "Just joined", icon: "sparkle", g: [g.sunset[2], g.spark2] },
  { key: "intent", title: "Same goals", sub: "Want what you want", icon: "matches", g: [g.sunset[2], g.sunset[1]] },
  { key: "compatibility", title: "Personality match", sub: "Think like you", icon: "likes", g: [c.brand, g.sunset[2]] },
  { key: "nearby", title: "Close by", sub: "Shortest distance first", icon: "pin", g: [g.sunset[1], g.spark] },
];

const POPULAR = ["travel", "coffee", "music_live", "food_trails", "films", "gym", "reading", "trekking", "photography", "cooking", "yoga", "gaming", "art", "dogs", "startups", "spirituality", "standup", "cricket"];

export default function Explore() {
  const { c, g } = useTheme();
  const { me } = useAuth();
  const { width } = useWindowDimensions();
  const mine = (me?.profile?.interests ?? "").split(",").filter(Boolean);
  const interests = [...mine, ...POPULAR.filter((k) => !mine.includes(k))].filter((k) => INTERESTS[k]).slice(0, 18);
  const tileW = (width - 40 - 12) / 2;
  const open = (key: string) => { haptic.tick(); router.push({ pathname: "/explore/[key]", params: { key } }); };

  return (
    <Screen pad={false} ambient="top">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14 }}>
          <T v="title">Explore</T>
          <T v="caption" tone="muted">Browse by what matters to you</T>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
          {collections(c, g).map((col, i) => (
            <Animated.View key={col.key} entering={FadeInDown.delay(i * 50).duration(300)}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${col.title}. ${col.sub}`} onPress={() => open(col.key)} style={{ width: 168, height: 200, borderRadius: 26, overflow: "hidden" }}>
                <LinearGradient colors={col.g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 16, justifyContent: "space-between" }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}><Icon name={col.icon} color="#FFF" size={26} /></View>
                  <View><T v="headline" tone="white" style={{ fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 21, lineHeight: 25 }}>{col.title}</T><T v="caption" tone="white" style={{ opacity: 0.9 }}>{col.sub}</T></View>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          ))}
          <SponsoredStoryTile />
        </ScrollView>

        <SponsoredSlot placement="FEED" style={{ paddingHorizontal: 20, paddingTop: 20 }} />

        <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 12 }}>
          <T v="headline">{mine.length ? "Your interests, and more" : "Popular interests"}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {interests.map((k) => (
              <Pressable key={k} accessibilityRole="button" accessibilityLabel={`People into ${INTERESTS[k]}`} onPress={() => open(`i:${k}`)}
                style={({ pressed }) => ({ width: tileW, flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: mine.includes(k) ? c.accent : c.line, opacity: pressed ? 0.7 : 1 })}>
                <T style={{ fontSize: 26 }}>{INTEREST_EMOJI[k] ?? "✨"}</T>
                <View style={{ flex: 1 }}>
                  <T v="callout" strong numberOfLines={1}>{INTERESTS[k]}</T>
                  {mine.includes(k) && <T v="caption" tone="muted">You're into this</T>}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
        <SponsoredSlot placement="RECOMMENDATION" after="FEED" compact style={{ paddingHorizontal: 20, paddingTop: 24 }} />
      </ScrollView>
    </Screen>
  );
}
