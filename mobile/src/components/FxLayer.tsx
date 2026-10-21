import { useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, ZoomIn } from "react-native-reanimated";
import { onCelebrate, useFx, type Celebration } from "@/lib/fx";
import { T } from "./Text";

/** One emoji particle that floats up, drifts and fades. */
export function Particle({ emoji, x, delay, size = 26, rise = 260 }: { emoji: string; x: number; delay: number; size?: number; rise?: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })); }, [t, delay]);
  const s = useAnimatedStyle(() => ({
    opacity: t.value < 0.15 ? t.value / 0.15 : 1 - (t.value - 0.15) / 0.85,
    transform: [{ translateY: -rise * t.value }, { translateX: x * t.value }, { scale: 0.6 + 0.6 * Math.sin(Math.PI * Math.min(1, t.value * 1.2)) }, { rotate: `${x / 6 * t.value}deg` }],
  }));
  return <Animated.Text style={[{ position: "absolute", fontSize: size }, s]} accessibilityElementsHidden>{emoji}</Animated.Text>;
}

/** A small burst of emoji at a spot (hearts above a message, sparkles on a button…). */
export function Burst({ emojis, size = 22, rise = 120 }: { emojis: readonly string[]; size?: number; rise?: number }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, alignItems: "center", justifyContent: "center" }}>
      {emojis.map((e, i) => <Particle key={i} emoji={e} x={(i - (emojis.length - 1) / 2) * 26 + ((i * 37) % 17) - 8} delay={i * 60} size={size} rise={rise + (i % 3) * 30} />)}
    </View>
  );
}

/** The emoji sequence (❤️ → 💖 → 💕 → ✨): each one pops in and hands over to the next. */
function Sequence({ seq }: { seq: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= seq.length - 1) return;
    const h = setTimeout(() => setI(i + 1), 230);
    return () => clearTimeout(h);
  }, [i, seq.length]);
  const pulse = useSharedValue(1);
  useEffect(() => { pulse.value = withSequence(withTiming(1.25, { duration: 120 }), withTiming(1, { duration: 140 })); }, [i, pulse]);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View key={i} entering={ZoomIn.springify().damping(12)} style={s}>
      <Text style={{ fontSize: 112, textShadowColor: "rgba(232,70,124,0.65)", textShadowRadius: 30 }} accessibilityElementsHidden>{seq[i]}</Text>
    </Animated.View>
  );
}

/** Full-screen, non-blocking layer for celebrations. Mounted once in the root layout. */
export function FxLayer() {
  const { width } = useWindowDimensions();
  const [c, setC] = useState<(Celebration & { id: number }) | null>(null);
  useEffect(() => onCelebrate((x) => setC({ ...x, id: Date.now() })), []);
  useEffect(() => {
    if (!c) return;
    const h = setTimeout(() => setC(null), 230 * c.seq.length + 1300);
    return () => clearTimeout(h);
  }, [c]);
  if (!c) return null;
  return (
    <Animated.View key={c.id} pointerEvents="none" entering={FadeIn.duration(120)} exiting={FadeOut.duration(260)} style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", zIndex: 1000 }]}>
      <Sequence seq={c.seq} />
      {c.burst && (
        <View style={{ position: "absolute", top: "50%", left: width / 2 }}>
          {c.burst.map((e, i) => <Particle key={i} emoji={e} x={(i - (c.burst!.length - 1) / 2) * 44 + ((i * 53) % 23) - 11} delay={200 + i * 70} size={30 + (i % 3) * 6} rise={300 + (i % 4) * 60} />)}
        </View>
      )}
      {c.caption && (
        <Animated.View entering={FadeIn.delay(300)} style={{ position: "absolute", bottom: "28%", backgroundColor: "rgba(15,7,9,0.82)", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 }}>
          <T v="headline" style={{ color: "#FFE3EE" }}>{c.caption}</T>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Slow ambient hearts and sparkles drifting upward (welcome, match). Off with animations off / reduced motion. */
export function FloatingHearts({ count = 9, emojis = ["❤️", "✨", "💕", "💖", "✨", "😉"] }: { count?: number; emojis?: string[] }) {
  const { height, width } = useWindowDimensions();
  const { motion } = useFx();
  if (!motion) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => <Drift key={i} emoji={emojis[i % emojis.length]} x={((i * 41) % 90) / 100 * width} delay={i * 1700} height={height} size={14 + (i % 4) * 5} />)}
    </View>
  );
}

function Drift({ emoji, x, delay, height, size }: { emoji: string; x: number; delay: number; height: number; size: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 15000, easing: Easing.linear }), -1)); }, [t, delay]);
  const s = useAnimatedStyle(() => ({
    opacity: 0.55 * Math.sin(Math.PI * t.value),
    transform: [{ translateY: height - (height + 60) * t.value }, { translateX: x + 18 * Math.sin(t.value * 9) }, { rotate: `${12 * Math.sin(t.value * 6)}deg` }],
  }));
  return <Animated.Text style={[{ position: "absolute", left: 0, top: 0, fontSize: size }, s]} accessibilityElementsHidden>{emoji}</Animated.Text>;
}
