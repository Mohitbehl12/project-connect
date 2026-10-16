import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { FlatList, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { VerifiedBadge } from "@/components/Icon";
import { T } from "@/components/Text";
import { ArcMark, CompatArc } from "@/components/Arc";
import { Aurora } from "@/components/Ambient";
import { useTheme } from "@/theme/ThemeProvider";
import type { Glow, Palette } from "@/theme/themes";

/** Three tilted sample cards (illustrations, not real people) fanned around the brand arc. */
const samples = (c: Palette, g: Glow) => [
  { name: "Meera", age: 29, score: 87, g: [g.spark2, g.sunset[2], g.spark], tag: "Trekking", rot: -9, x: -0.3, y: 0.06 },
  { name: "Arjun", age: 31, score: 82, g: [c.trust, "#7FD1B0", c.raised], tag: "Cooking", rot: 8, x: 0.3, y: 0.08 },
  { name: "Sara", age: 27, score: 91, g: [g.sunset[1], g.spark, c.accentWash], tag: "Live music", rot: 0, x: 0, y: 0 },
] as const;

function Collage({ size }: { size: number }) {
  const { c, g } = useTheme();
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { if (!reduced) p.value = withDelay(200, withTiming(1, { duration: 900, easing: Easing.out(Easing.back(1.3)) })); }, [p, reduced]);
  const w = size * 0.62, h = w * 1.32;
  return (
    <View style={{ width: size * 1.3, height: h * 1.12, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {samples(c, g).map((s, i) => <SampleCard key={s.name} s={s} w={w} h={h} p={p} spread={size} hero={i === 2} />)}
    </View>
  );
}

function SampleCard({ s, w, h, p, spread, hero }: { s: ReturnType<typeof samples>[number]; w: number; h: number; p: SharedValue<number>; spread: number; hero: boolean }) {
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.5),
    transform: [{ translateX: s.x * spread * p.value }, { translateY: s.y * spread + (1 - p.value) * 40 }, { rotate: `${s.rot * p.value}deg` }, { scale: hero ? 1 : 0.9 }],
  }));
  return (
    <Animated.View style={[{ position: "absolute", width: w, height: h, borderRadius: 26, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }, style]}>
      <LinearGradient colors={[...s.g]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
      {/* soft abstract figure */}
      <View style={{ position: "absolute", left: w * 0.3, top: h * 0.16, width: w * 0.4, height: w * 0.4, borderRadius: w, backgroundColor: "rgba(255,255,255,0.35)" }} />
      <View style={{ position: "absolute", left: w * 0.12, top: h * 0.46, width: w * 0.76, height: h * 0.7, borderRadius: w, backgroundColor: "rgba(255,255,255,0.25)" }} />
      <LinearGradient colors={["transparent", "rgba(12,11,30,0.85)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h * 0.5 }} />
      <View style={{ position: "absolute", top: 10, right: 10 }}><CompatArc score={s.score} size={hero ? 46 : 40} onDark /></View>
      <View style={{ position: "absolute", left: 14, right: 14, bottom: 14, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <T v="headline" tone="white" style={{ fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: hero ? 22 : 19 }}>{s.name}, {s.age}</T>
          {hero && <VerifiedBadge size={18} />}
        </View>
        <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)" }}>
          <T v="caption" tone="white" style={{ fontFamily: "Figtree_700Bold" }}>{s.tag}</T>
        </View>
      </View>
    </Animated.View>
  );
}

function MiniCard() {
  const { c, g } = useTheme();
  return (
    <View style={{ width: 280, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", padding: 18, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <CompatArc score={87} size={64} onDark />
        <View style={{ flex: 1 }}>
          <T v="headline" tone="white">Meera, 29</T>
          <T v="caption" style={{ color: g.onNight }}>Bengaluru · About 5 km away</T>
        </View>
      </View>
      {["Looking for the same kind of relationship", "You both love trekking and coffee", "You both like to take things slow"].map((r) => (
        <View key={r} style={{ flexDirection: "row", gap: 8 }}>
          <T style={{ color: "#7FD1B0" }}>✓</T><T v="callout" tone="white" style={{ flex: 1 }}>{r}</T>
        </View>
      ))}
    </View>
  );
}

function SafetyArt() {
  const { c, g } = useTheme();
  return (
    <View style={{ width: 280, gap: 12 }}>
      {[
        ["Verified profiles", "A quick selfie check earns the sage ring."],
        ["Report in two taps", "Reporting also blocks them instantly."],
        ["Your details stay yours", "No one sees your number, email or exact location."],
      ].map(([t, b], i) => (
        <View key={t} style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 18, padding: 14 }}>
          {i === 0 ? <VerifiedBadge size={28} /> : <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i === 1 ? g.spark : g.spark2 }} />}
          <View style={{ flex: 1 }}>
            <T v="callout" tone="white">{t}</T>
            <T v="caption" style={{ color: g.onNight }}>{b}</T>
          </View>
        </View>
      ))}
    </View>
  );
}

const SLIDES = [
  { title: "Meet someone worth staying for.", body: "Meaningful connections with people who match your vibe, values and energy." },
  { title: "Know why before you say hello.", body: "Every profile shows what you have in common." },
  { title: "Safe by design.", body: "Verification, quick reporting and privacy built in." },
];

export default function Welcome() {
  const { c, g } = useTheme();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const list = useRef<FlatList>(null);
  const art = Math.min(width * 0.6, height * 0.3);

  return (
    <View style={{ flex: 1, backgroundColor: g.night }}>
      <StatusBar style="light" />
      <LinearGradient colors={[c.brand, g.night]} start={{ x: 0.2, y: 0 }} end={{ x: 0.5, y: 0.75 }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
      <Aurora variant="match" style={{ opacity: 0.55 }} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 24, paddingTop: 8 }}>
          <ArcMark size={28} left={g.onNight} right={g.spark} />
          <T v="headline" tone="white" style={{ fontFamily: "BricolageGrotesque_800ExtraBold" }}>Project Connect</T>
        </View>
        <FlatList
          ref={list}
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => s.title}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index }) => (
            <View style={{ width, flex: 1, paddingHorizontal: 28, justifyContent: "center", gap: 36 }}>
              <View style={{ alignItems: "center", minHeight: art }}>
                {index === 0 ? <Collage size={art} /> : index === 1 ? <MiniCard /> : <SafetyArt />}
              </View>
              <Animated.View entering={FadeInDown.duration(400).delay(150)} style={{ gap: 10 }}>
                <T v="display" tone="white" style={{ fontSize: 38, lineHeight: 42 }}>{item.title}</T>
                <T tone="white" style={{ opacity: 0.75 }}>{item.body}</T>
              </Animated.View>
            </View>
          )}
        />
        <View style={{ paddingHorizontal: 24, gap: 12, paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", gap: 6, justifyContent: "center", marginBottom: 8 }} accessibilityLabel={`Page ${page + 1} of 3`}>
            {SLIDES.map((s, i) => <View key={s.title} style={{ height: 6, width: i === page ? 22 : 6, borderRadius: 3, backgroundColor: i === page ? g.spark : "rgba(255,255,255,0.3)" }} />)}
          </View>
          <Button title="Find my match" v="accent" size="lg" full onPress={() => router.push("/sign-up")} />
          <Button title="I already have an account" v="ghost" textColor="#FFFFFF" full onPress={() => router.push("/sign-in")} />
          <T v="caption" center style={{ color: "rgba(255,255,255,0.55)" }}>For adults 18 and over.</T>
        </View>
      </SafeAreaView>
    </View>
  );
}
