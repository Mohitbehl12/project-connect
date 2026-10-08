import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { FlatList, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Button } from "@/components/Button";
import { VerifiedBadge } from "@/components/Icon";
import { T } from "@/components/Text";
import { CompatArc } from "@/components/Arc";

/** The signature moment: two arcs slide together until they almost close. */
function HeroArcs({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { if (!reduced) p.value = withDelay(250, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })); }, [p, reduced]);
  const left = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - p.value) * -size * 0.28 }, { rotate: `${(1 - p.value) * -25}deg` }], opacity: 0.3 + p.value * 0.7 }));
  const right = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - p.value) * size * 0.28 }, { rotate: `${(1 - p.value) * 25}deg` }], opacity: 0.3 + p.value * 0.7 }));
  const w = size * 0.11, r = size / 2 - w, cx = size / 2, g = 0.24;
  const pt = (a: number) => `${cx + r * Math.cos(a)} ${cx + r * Math.sin(a)}`;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden>
      <Animated.View style={[{ position: "absolute" }, left]}>
        <Svg width={size} height={size}><Path d={`M${pt(-Math.PI / 2 - g)} A${r} ${r} 0 0 0 ${pt(Math.PI / 2 + g)}`} stroke="#C9C4FF" strokeWidth={w} strokeLinecap="round" fill="none" /></Svg>
      </Animated.View>
      <Animated.View style={[{ position: "absolute" }, right]}>
        <Svg width={size} height={size}><Path d={`M${pt(-Math.PI / 2 + g)} A${r} ${r} 0 0 1 ${pt(Math.PI / 2 - g)}`} stroke="#F5B656" strokeWidth={w} strokeLinecap="round" fill="none" /></Svg>
      </Animated.View>
    </View>
  );
}

function MiniCard() {
  return (
    <View style={{ width: 280, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", padding: 18, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <CompatArc score={87} size={64} onDark />
        <View style={{ flex: 1 }}>
          <T v="headline" tone="white">Meera, 29</T>
          <T v="caption" style={{ color: "#C9C4FF" }}>Bengaluru · About 5 km away</T>
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
  return (
    <View style={{ width: 280, gap: 12 }}>
      {[
        ["Verified profiles", "A quick selfie check earns the sage ring."],
        ["Report in two taps", "Reporting also blocks them instantly."],
        ["Your details stay yours", "No one sees your number, email or exact location."],
      ].map(([t, b], i) => (
        <View key={t} style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 18, padding: 14 }}>
          {i === 0 ? <VerifiedBadge size={28} /> : <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i === 1 ? "#F5B656" : "#8F88F0" }} />}
          <View style={{ flex: 1 }}>
            <T v="callout" tone="white">{t}</T>
            <T v="caption" style={{ color: "#C9C4FF" }}>{b}</T>
          </View>
        </View>
      ))}
    </View>
  );
}

const SLIDES = [
  { title: "Meet people who actually match you.", body: "Compatibility first, endless swiping never." },
  { title: "Know why before you say hello.", body: "Every profile shows what you have in common." },
  { title: "Safe by design.", body: "Verification, quick reporting and privacy built in." },
];

export default function Welcome() {
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const list = useRef<FlatList>(null);
  const art = Math.min(width * 0.62, height * 0.3);

  return (
    <View style={{ flex: 1, backgroundColor: "#12112A" }}>
      <StatusBar style="light" />
      <LinearGradient colors={["#2E2A6E", "#12112A"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.5, y: 0.75 }} style={{ position: "absolute", inset: 0 }} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 24, paddingTop: 8 }}>
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
                {index === 0 ? <HeroArcs size={art} /> : index === 1 ? <MiniCard /> : <SafetyArt />}
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
            {SLIDES.map((s, i) => <View key={s.title} style={{ height: 6, width: i === page ? 22 : 6, borderRadius: 3, backgroundColor: i === page ? "#F5B656" : "rgba(255,255,255,0.3)" }} />)}
          </View>
          <Button title="Create my profile" v="accent" size="lg" full onPress={() => router.push("/sign-up")} />
          <Button title="I already have an account" v="ghost" textColor="#FFFFFF" full onPress={() => router.push("/sign-in")} />
          <T v="caption" center style={{ color: "rgba(255,255,255,0.55)" }}>For adults 18 and over.</T>
        </View>
      </SafeAreaView>
    </View>
  );
}
