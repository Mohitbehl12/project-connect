import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { alpha } from "@/theme/themes";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Ambient light: three soft colour fields drawn with radial gradients (cheap — one SVG, no blur pass).
 * Sits behind a screen's content to give depth without competing with photos.
 */
export function Aurora({ variant = "top", style }: { variant?: "top" | "full" | "match"; style?: ViewStyle }) {
  const { dark, g } = useTheme();
  const [a, b, c] = variant === "match" ? [alpha(g.spark, 0.5), alpha(g.sunset[1], 0.45), alpha(g.sunset[2], 0.55)] : g.aurora[dark ? "dark" : "light"];
  // Full-height canvas so no field is ever clipped into a hard edge; "top" just keeps the light high and fading out.
  const top = variant === "top";
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="a1" cx="18%" cy={top ? "4%" : "8%"} r={top ? "48%" : "62%"}><Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={a} stopOpacity={0} /></RadialGradient>
          <RadialGradient id="a2" cx="92%" cy={top ? "10%" : "18%"} r={top ? "40%" : "55%"}><Stop offset="0" stopColor={b} /><Stop offset="1" stopColor={b} stopOpacity={0} /></RadialGradient>
          <RadialGradient id="a3" cx="55%" cy={top ? "34%" : "85%"} r={top ? "36%" : "60%"}><Stop offset="0" stopColor={c} /><Stop offset="1" stopColor={c} stopOpacity={0} /></RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#a1)" />
        <Rect width="100%" height="100%" fill="url(#a2)" />
        <Rect width="100%" height="100%" fill="url(#a3)" />
      </Svg>
    </View>
  );
}

/** Frosted glass surface. Blur on iOS and web; a dense tint on Android where blur is costly. */
export function Glass({ children, style, intensity = 40, tint, radius = 24, border = true }: {
  children?: ReactNode; style?: ViewStyle; intensity?: number; tint?: "light" | "dark"; radius?: number; border?: boolean;
}) {
  const { dark, g } = useTheme();
  const t = tint ?? (dark ? "dark" : "light");
  const fallback = t === "dark" ? alpha(g.nightRaised, 0.88) : "rgba(255,255,255,0.86)";
  const edge = t === "dark" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.75)";
  return (
    <View style={[{ borderRadius: radius, overflow: "hidden", borderWidth: border ? StyleSheet.hairlineWidth * 2 : 0, borderColor: edge }, style]}>
      {Platform.OS === "android"
        ? <View style={[StyleSheet.absoluteFill, { backgroundColor: fallback }]} />
        : <BlurView intensity={intensity} tint={t === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
      {Platform.OS !== "android" && <View style={[StyleSheet.absoluteFill, { backgroundColor: t === "dark" ? alpha(g.night, 0.35) : "rgba(255,255,255,0.45)" }]} />}
      {children}
    </View>
  );
}

/** The warm sunset fill used only for Like and celebration moments. */
export function Sunset({ style, children }: { style?: ViewStyle; children?: ReactNode }) {
  const { g } = useTheme();
  return <LinearGradient colors={[...g.sunset]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>{children}</LinearGradient>;
}

/** A sunset-gradient ring around an avatar — marks someone new you haven't talked to yet. */
export function Ring({ size, children, active = true }: { size: number; children: ReactNode; active?: boolean }) {
  const { c, g } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, padding: 3, overflow: "hidden" }}>
      {active ? <LinearGradient colors={[...g.sunset]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: c.line }]} />}
      <View style={{ flex: 1, borderRadius: size, padding: 2.5, backgroundColor: c.bg }}>{children}</View>
    </View>
  );
}
