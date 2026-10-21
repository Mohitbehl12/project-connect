import { INTERESTS } from "@shared/constants";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";
import { useFx } from "@/lib/fx";
import { alpha } from "@/theme/themes";
import { useTheme } from "@/theme/ThemeProvider";
import { LuxIcon } from "./LuxIcon";
import { T } from "./Text";

/** Four tiny sparkles that drift out and fade (≈450 ms) when an interest is chosen. */
function Burst({ fire, color }: { fire: number; color: string }) {
  const { motion } = useFx();
  return motion && fire ? <>{[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy], i) => <Spark key={`${fire}-${i}`} dx={dx} dy={dy} color={color} delay={i * 30} />)}</> : null;
}
function Spark({ dx, dy, color, delay }: { dx: number; dy: number; color: string; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: 450 + delay, easing: Easing.out(Easing.quad) }); }, [t, delay]);
  const st = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ translateX: dx * 26 * t.value }, { translateY: dy * 22 * t.value }, { scale: 0.6 + t.value * 0.6 }] }));
  return <Animated.Text pointerEvents="none" style={[{ position: "absolute", alignSelf: "center", top: 18, fontSize: 12, color }, st]}>✦</Animated.Text>;
}

/**
 * A premium interest card: custom line icon on a soft gradient, thin border and shadow. Selected: glowing
 * rose→gold border, gradient icon and a small "✓ ✨" mark — never a plain blue checkmark.
 */
export function InterestTile({ k, selected, onPress, width, sub, disabled }: { k: string; selected: boolean; onPress: () => void; width: number; sub?: string; disabled?: boolean }) {
  const { c, g, dark } = useTheme();
  const { motion } = useFx();
  const s = useSharedValue(1);
  const [fire, setFire] = useState(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const label = INTERESTS[k] ?? k;
  return (
    <Animated.View style={[{ width }, anim]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} accessibilityLabel={sub ? `${label}, ${sub}` : label} disabled={disabled}
        onPressIn={() => { if (motion) s.value = withTiming(0.96, { duration: 90 }); }}
        onPressOut={() => { s.value = motion ? withSpring(1, { damping: 12, stiffness: 220 }) : 1; }}
        onPress={() => { if (!selected) { setFire((f) => f + 1); if (motion) s.value = withSequence(withTiming(1.06, { duration: 140 }), withSpring(1, { damping: 10 })); } haptic.tick(); onPress(); }}
        style={{ opacity: disabled ? 0.45 : 1 }}>
        <LinearGradient colors={selected ? [g.sunset[0], c.accent] : [c.line, c.line]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 22, padding: selected ? 1.5 : 1, shadowColor: selected ? g.sunset[0] : "#000", shadowOpacity: selected ? (dark ? 0.6 : 0.3) : dark ? 0.3 : 0.06, shadowRadius: selected ? 14 : 10, shadowOffset: { width: 0, height: 6 }, elevation: selected ? 6 : 2 }}>
          <LinearGradient colors={selected ? [alpha(g.sunset[0], dark ? 0.22 : 0.1), c.surface] : [c.surface, c.raised]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 21, paddingVertical: 14, paddingHorizontal: 10, alignItems: "center", gap: 6 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: selected ? alpha(c.accent, dark ? 0.16 : 0.18) : alpha(c.text, 0.04) }}>
              <LuxIcon name={k} size={28} active={selected} color={c.muted} />
            </View>
            <T v="callout" strong={selected} center numberOfLines={1} style={{ color: selected ? c.text : c.muted }}>{label}</T>
            {!!sub && <T v="caption" tone="faint" center numberOfLines={1}>{sub}</T>}
            <Burst fire={fire} color={c.accent} />
          </LinearGradient>
        </LinearGradient>
        {selected && (
          <View style={{ position: "absolute", top: -6, right: -4, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, height: 22, borderRadius: 11, backgroundColor: c.accent }}>
            <T v="caption" strong style={{ color: c.accentText, fontSize: 11, lineHeight: 14 }}>✓ ✨</T>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Grid of interest tiles (3 per row on phones). */
export function InterestPicker({ value, onChange, max = 10, keys = Object.keys(INTERESTS) }: { value: string[]; onChange: (v: string[]) => void; max?: number; keys?: string[] }) {
  const { width: screen } = useWindowDimensions();
  const [width, setWidth] = useState(Math.min(screen, 720) - 40);
  const cols = width > 560 ? 5 : 3;
  const w = Math.floor((width - 10 * (cols - 1)) / cols);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 6 }}>
      {keys.map((k) => {
        const on = value.includes(k);
        return <InterestTile key={k} k={k} width={w} selected={on} disabled={!on && value.length >= max}
          onPress={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])} />;
      })}
    </View>
  );
}
