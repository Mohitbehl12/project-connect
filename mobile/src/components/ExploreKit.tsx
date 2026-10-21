import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useFx } from "@/lib/fx";
import { haptic } from "@/lib/haptics";
import { alpha } from "@/theme/themes";
import { useTheme } from "@/theme/ThemeProvider";
import { LuxIcon } from "./LuxIcon";
import { T } from "./Text";

// Explore building blocks: slow particles, collection cards with illustrated art, chemistry labels.

/** A few slow, drifting sparkles and hearts. Off with reduced motion or animations off; few elements, long loops. */
export function Particles({ count = 7, color = "#FFFFFF" }: { count?: number; color?: string }) {
  const { motion } = useFx();
  if (!motion) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => <Particle key={i} i={i} color={color} />)}
    </View>
  );
}
function Particle({ i, color }: { i: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(i * 900, withRepeat(withTiming(1, { duration: 9000 + (i % 3) * 2500, easing: Easing.inOut(Easing.sin) }), -1, false));
    return () => cancelAnimation(t);
  }, [t, i]);
  const st = useAnimatedStyle(() => ({ opacity: Math.sin(t.value * Math.PI) * 0.7, transform: [{ translateY: -t.value * 70 }, { translateX: Math.sin(t.value * 6.28) * 6 }] }));
  return <Animated.Text style={[{ position: "absolute", left: `${(i * 37 + 11) % 92}%`, bottom: 8 + (i % 3) * 14, fontSize: 9 + (i % 3) * 3, color }, st]}>{i % 3 === 1 ? "♥" : "✦"}</Animated.Text>;
}

// Rich, dark gradients so white text always reads well — in both themes.
const GRADS: Record<string, [string, string, string]> = {
  "your-interests": ["#5B0F2E", "#9B1B4A", "#E8467C"], trending: ["#3A0A12", "#9C2A1F", "#E8743B"], new: ["#22103F", "#5E2A9C", "#C38BF2"],
  around: ["#0F2530", "#1E5F72", "#5FB3B3"], recommended: ["#3B0A20", "#7B2FB0", "#E8467C"], popular: ["#2A1A06", "#8A6420", "#E9C37A"],
  lifestyle: ["#3A0B1E", "#8E2347", "#F29CB5"], music: ["#160F33", "#3B2C8C", "#8F7BF2"], travel: ["#0C2235", "#1F5C8C", "#7FC4E8"],
  food: ["#2E0A14", "#7A1F35", "#D9876A"], fitness: ["#0F2A22", "#1F6B52", "#7FD1B0"], art: ["#2B0F35", "#7E2E86", "#F2A3C7"],
};
const ART: Record<string, string> = {
  "your-interests": "heart", trending: "flame", new: "newPeople", around: "search", recommended: "spark", popular: "star", lifestyle: "rose",
  music: "music_live", travel: "travel", food: "wine", fitness: "gym", art: "art",
};

/**
 * A collection card: illustrated art (our own line drawing, large and soft) on a deep gradient, a dark
 * overlay for legibility, the title, a real people count and "Explore →". Tap: the art zooms gently,
 * the border glows, the arrow nudges right and a few sparkles appear.
 */
export function CollectionCard({ k, title, sub, label, emoji, width, height = 188, onPress }: { k: string; title: string; sub: string; label: string; emoji?: string; width: number; height?: number; onPress: () => void }) {
  const { c } = useTheme();
  const { motion } = useFx();
  const p = useSharedValue(0);
  const [lit, setLit] = useState(false);
  const zoom = useAnimatedStyle(() => ({ transform: [{ scale: 1 + p.value * 0.08 }, { rotate: `${-12 + p.value * 4}deg` }] }));
  const arrow = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * 6 }] }));
  const glow = useAnimatedStyle(() => ({ borderColor: p.value > 0.5 ? c.accent : "rgba(255,255,255,0.14)", shadowOpacity: 0.15 + p.value * 0.35 }));
  const g = GRADS[k] ?? GRADS.recommended;
  return (
    <Animated.View style={[{ width, height, borderRadius: 26, borderWidth: 1, shadowColor: g[2], shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 }, glow]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${sub} ${label}. Explore`}
        onPressIn={() => { setLit(true); p.value = motion ? withTiming(1, { duration: 260 }) : 1; }}
        onPressOut={() => { p.value = motion ? withTiming(0, { duration: 420 }) : 0; setTimeout(() => setLit(false), 400); }}
        onPress={() => { haptic.tick(); onPress(); }}
        style={{ flex: 1, borderRadius: 25, overflow: "hidden" }}>
        <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View style={[{ position: "absolute", right: -26, top: -10, opacity: 0.32 }, zoom]}>
          <LuxIcon name={ART[k] ?? "spark"} size={150} color="#FFFFFF" stroke={0.9} pop={false} />
        </Animated.View>
        <LinearGradient colors={["transparent", "rgba(10,4,8,0.72)"]} style={[StyleSheet.absoluteFill, { top: "35%" }]} />
        {lit && motion && <Particles count={4} color="#FFE8B0" />}
        {!!emoji && (
          <View style={{ position: "absolute", top: 12, left: 12, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" }}>
            <T style={{ fontSize: 16, lineHeight: 20 }}>{emoji}</T>
          </View>
        )}
        <View style={{ flex: 1, padding: 14, justifyContent: "flex-end", gap: 2 }}>
          <T v="headline" tone="white" style={{ fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: width < 180 ? 16.5 : 18, lineHeight: width < 180 ? 20 : 22 }} numberOfLines={2}>{title}</T>
          <T v="caption" tone="white" style={{ opacity: 0.8 }} numberOfLines={1}>{label}</T>
          <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }, arrow]}>
            <T v="caption" strong style={{ color: "#F3D9A4" }}>Explore →</T>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** "✨ Strong Chemistry" pill — always an estimate. */
export function ChemistryPill({ label, onDark }: { label?: string | null; onDark?: boolean }) {
  const { c } = useTheme();
  if (!label) return null;
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: onDark ? "rgba(233,195,122,0.22)" : alpha(c.accent, 0.25), borderWidth: 1, borderColor: onDark ? "rgba(233,195,122,0.55)" : alpha(c.accent, 0.6) }}>
      <T v="caption" strong style={{ color: onDark ? "#F7E2B5" : c.accentText, fontSize: 11.5, lineHeight: 15 }}>{label}</T>
    </View>
  );
}

/** Round glass action used on profile cards (Like / Spark / View). */
export function CardAction({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  const { g } = useTheme();
  const { motion } = useFx();
  const s = useSharedValue(1);
  const [on, setOn] = useState(false);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={st}>
      <Pressable accessibilityRole="button" accessibilityLabel={label}
        onPress={() => { setOn(true); if (motion) s.value = withSequence(withTiming(1.18, { duration: 150 }), withSpring(1, { damping: 8 })); setTimeout(() => setOn(false), 500); onPress(); }}
        style={{ width: primary ? 48 : 42, height: primary ? 48 : 42, borderRadius: 24, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: primary ? undefined : "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" }}>
        {primary && <LinearGradient colors={[g.sunset[0], g.sunset[2]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
        <LuxIcon name={icon} size={primary ? 24 : 21} color="#FFFFFF" active={on && !primary} stroke={1.7} />
      </Pressable>
    </Animated.View>
  );
}

export function SectionTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 20, gap: 10 }}>
      <View style={{ flex: 1 }}>
        <T v="headline" style={{ fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 22, lineHeight: 27 }}>{title}</T>
        {!!sub && <T v="caption" tone="muted">{sub}</T>}
      </View>
      {right}
    </View>
  );
}
