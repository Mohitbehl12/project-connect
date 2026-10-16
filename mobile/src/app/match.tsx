import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { Button } from "@/components/Button";
import { Aurora } from "@/components/Ambient";
import { LikeBurst } from "@/components/CardDeck";
import { T } from "@/components/Text";
import { PhotoView } from "@/components/ui";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import type { Card, MyPhoto } from "@/lib/types";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The match moment: both photos slide in, an arc draws around them and closes into one ring.
 * Under 1.5 s, success haptic when the ring closes, tap anywhere to skip. Crossfade under reduced motion.
 */
export default function MatchMoment() {
  const { matchId } = useLocalSearchParams<{ matchId: string; userId: string }>();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const match = useQuery({ queryKey: ["match", matchId], queryFn: () => api<{ other: Card; starters: { tip: string; text: string }[] }>(`/api/matches/${matchId}`) });
  const mine = useQuery({ queryKey: ["photos"], queryFn: () => api<{ photos: MyPhoto[] }>("/api/photos") });

  const [picked, setPicked] = useState(0);
  const size = Math.min(124, width * 0.3);
  const ring = size * 2 + 40;
  const r = ring / 2 - 6;
  const circ = 2 * Math.PI * r;
  const slide = useSharedValue(reduced ? 1 : 0);
  const draw = useSharedValue(reduced ? 1 : 0);
  const pop = useSharedValue(1);
  const burst = useSharedValue(0);
  const glow = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) { haptic.success(); return; }
    slide.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    draw.value = withDelay(380, withTiming(1, { duration: 650, easing: Easing.inOut(Easing.cubic) }, (done) => {
      if (done) {
        scheduleOnRN(haptic.success);
        pop.value = withSequence(withSpring(1.06, { damping: 8 }), withSpring(1));
        burst.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
        glow.value = withTiming(1, { duration: 600 });
      }
    }));
  }, [reduced, slide, draw, pop, burst, glow]);

  const skip = () => { slide.value = 1; draw.value = 1; };
  const leftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - slide.value) * -width * 0.6 }, { rotate: `${(1 - slide.value) * -12}deg` }] }));
  const rightStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - slide.value) * width * 0.6 }, { rotate: `${(1 - slide.value) * 12}deg` }] }));
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - draw.value) }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.9, transform: [{ scale: 0.7 + glow.value * 0.35 }] }));

  const other = match.data?.other;
  const name = other?.firstName ?? "your match";
  const starter = match.data?.starters[picked];

  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: "#16112A" }}>
      <Aurora variant="match" />
      <Pressable style={{ flex: 1 }} onPress={skip} accessibilityLabel={`It's a match with ${name}`}>
        <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 22, paddingHorizontal: 24 }}>
          <Animated.View style={[{ width: ring, height: ring, alignItems: "center", justifyContent: "center" }, popStyle]}>
            <Animated.View pointerEvents="none" style={[{ position: "absolute", width: ring * 1.25, height: ring * 1.25, borderRadius: ring, backgroundColor: "rgba(240,134,74,0.22)", shadowColor: "#A98BEA", shadowOpacity: 0.9, shadowRadius: 60 }, glowStyle]} />
            <LikeBurst progress={burst} top="50%" spread={1.9} />
            <Svg width={ring} height={ring} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
              <AnimatedCircle cx={ring / 2} cy={ring / 2} r={r} stroke="#7FD8BE" strokeWidth={6} strokeLinecap="round" fill="none" strokeDasharray={`${circ} ${circ}`} animatedProps={ringProps} />
            </Svg>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Animated.View style={leftStyle}><PhotoView photo={mine.data?.photos[0]} rounded={size / 2} style={{ width: size, height: size, borderWidth: 3, borderColor: "#E3D6FF" }} /></Animated.View>
              <Animated.View style={rightStyle}><PhotoView photo={other?.photos[0]} rounded={size / 2} style={{ width: size, height: size, borderWidth: 3, borderColor: "#7FD8BE" }} /></Animated.View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(reduced ? 0 : 700).duration(320)} style={{ alignItems: "center", gap: 8 }}>
            <T v="display" tone="white" center style={{ fontSize: 40, lineHeight: 44 }}>It's a match ✨</T>
            <T tone="white" center style={{ opacity: 0.8 }}>You and {name} liked each other.</T>
          </Animated.View>

          {!!match.data?.starters.length && (
            <Animated.View entering={FadeInDown.delay(reduced ? 0 : 850).duration(320)} style={{ alignSelf: "stretch", gap: 8 }}>
              <T v="caption" style={{ color: "#E3D6FF", fontFamily: "Figtree_700Bold", letterSpacing: 0.3 }}>Start with something easy</T>
              {match.data.starters.slice(0, 3).map((st, i) => (
                <Pressable key={st.text} accessibilityRole="button" accessibilityLabel={`Use starter: ${st.text}`}
                  onPress={() => { haptic.tick(); setPicked(i); }}
                  style={{ backgroundColor: picked === i ? "rgba(245,182,86,0.18)" : "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: picked === i ? "#7FD8BE" : "rgba(255,255,255,0.12)", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 2 }}>
                  <T v="caption" style={{ color: "#E3D6FF" }}>{st.tip}</T>
                  <T v="callout" tone="white">{st.text}</T>
                </Pressable>
              ))}
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(reduced ? 0 : 950).duration(320)} style={{ alignSelf: "stretch", gap: 10 }}>
            <Button title="Say hello" v="accent" size="lg" full icon="messages"
              onPress={() => router.replace({ pathname: "/chat/[id]", params: { id: matchId, draft: starter?.text ?? "" } })} />
            <Button title="Keep looking" v="ghost" textColor="#FFFFFF" full onPress={() => router.back()} />
          </Animated.View>
        </SafeAreaView>
      </Pressable>
    </Animated.View>
  );
}
