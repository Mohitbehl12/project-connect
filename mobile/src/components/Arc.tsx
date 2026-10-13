import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, withRepeat, useReducedMotion, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";
import { T } from "./Text";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The brand symbol: two open curves. `closed` (0..1) pulls them together into a ring. */
export function ArcMark({ size = 48, left, right, stroke }: { size?: number; left?: string; right?: string; stroke?: number }) {
  const { c } = useTheme();
  const w = stroke ?? size * 0.11;
  const r = size / 2 - w;
  const cx = size / 2;
  const g = 0.24;
  const pt = (a: number) => `${cx + r * Math.cos(a)} ${cx + r * Math.sin(a)}`;
  return (
    <Svg width={size} height={size}>
      <Path d={`M${pt(-Math.PI / 2 - g)} A${r} ${r} 0 0 0 ${pt(Math.PI / 2 + g)}`} stroke={left ?? c.brand} strokeWidth={w} strokeLinecap="round" fill="none" />
      <Path d={`M${pt(-Math.PI / 2 + g)} A${r} ${r} 0 0 1 ${pt(Math.PI / 2 - g)}`} stroke={right ?? c.accent} strokeWidth={w} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Loading indicator: the arc rotating (replaces spinners). Static under reduced motion. */
export function ArcLoader({ size = 36, label = "Loading" }: { size?: number; label?: string }) {
  const rot = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) rot.value = withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1);
  }, [reduced, rot]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Animated.View style={style}>
        <ArcMark size={size} />
      </Animated.View>
    </View>
  );
}

/**
 * Compatibility meter. The arc draws in when shown; `live` lets a gesture drive it (swipe feedback).
 */
export function CompatArc({ score, size = 56, live, onDark, label = true }: { score: number; size?: number; live?: SharedValue<number>; onDark?: boolean; label?: boolean }) {
  const { c } = useTheme();
  const stroke = Math.max(4, size * 0.09);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const reduced = useReducedMotion();
  const drawn = useSharedValue(reduced ? score / 100 : 0);
  useEffect(() => {
    drawn.value = reduced ? score / 100 : withTiming(score / 100, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [score, reduced, drawn]);
  const props = useAnimatedProps(() => {
    const extra = live ? Math.max(0, live.value) * (1 - drawn.value) : 0; // a right swipe "closes" the ring
    return { strokeDashoffset: circ * (1 - Math.min(1, drawn.value + extra)) };
  });
  const tone = score >= 80 ? (onDark ? "#7FD1B0" : c.trust) : score >= 65 ? c.accent : onDark ? "#C9C4FF" : c.faint;
  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel={`${score} percent compatible`}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={onDark ? "rgba(255,255,255,0.22)" : c.raised} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth={stroke} strokeLinecap="round" fill="none"
          strokeDasharray={`${circ} ${circ}`} animatedProps={props} />
      </Svg>
      {label && (
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <T v={size >= 80 ? "title" : "callout"} tone={onDark ? "white" : "text"} style={{ fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: size * 0.3, lineHeight: size * 0.34 }}>
            {score}<T tone={onDark ? "white" : "muted"} style={{ fontSize: size * 0.15 }}>%</T>
          </T>
        </View>
      )}
    </View>
  );
}
