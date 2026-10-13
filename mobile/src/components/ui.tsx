import { Image } from "expo-image";
import { Aurora } from "./Ambient";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming, useReducedMotion } from "react-native-reanimated";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import Svg, { Path, Circle } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";
import { mediaUrl } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import type { Photo } from "@/lib/types";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { T } from "./Text";

export function Screen({ children, edges = ["top"], style, scroll, pad = true, ambient }: { children: ReactNode; edges?: Edge[]; style?: ViewStyle; scroll?: boolean; pad?: boolean; ambient?: "top" | "full" }) {
  const { c } = useTheme();
  const inner = { paddingHorizontal: pad ? 20 : 0, flexGrow: 1 };
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: c.bg }, style]}>
      {ambient && <Aurora variant={ambient} />}
      {scroll ? <ScrollView contentContainerStyle={[inner, { paddingBottom: 32 }]} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[inner, { flex: 1 }]}>{children}</View>}
    </SafeAreaView>
  );
}

export function Chip({ label, emoji, selected, onPress, tone = "neutral", locked, small }: {
  label: string; emoji?: string; selected?: boolean; onPress?: () => void; tone?: "neutral" | "shared" | "accent" | "glass"; locked?: boolean; small?: boolean;
}) {
  const { c } = useTheme();
  const bg = selected ? c.brand : tone === "shared" ? c.trustWash : tone === "accent" ? c.accentWash : tone === "glass" ? "rgba(255,255,255,0.18)" : c.raised;
  const fg = selected ? c.brandText : tone === "shared" ? c.trust : tone === "glass" ? "#FFFFFF" : c.text;
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: bg, borderRadius: 999, paddingHorizontal: small ? 10 : 14, paddingVertical: small ? 5 : 9, minHeight: small ? 28 : 40 }}>
      {emoji ? <T v="callout" style={{ fontSize: small ? 13 : 15 }}>{emoji}</T> : null}
      <T v={small ? "caption" : "callout"} style={{ color: fg }}>{label}</T>
      {locked && <Icon name="lock" size={14} color={fg} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={label}
      onPress={() => { haptic.tick(); onPress(); }} hitSlop={4}>
      {content}
    </Pressable>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T v="callout" tone="muted">{label}</T>
      <TextInput
        placeholderTextColor={c.faint}
        accessibilityLabel={label}
        onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
        {...props}
        style={[{
          minHeight: 52, borderRadius: 16, borderWidth: 1.5, borderColor: error ? c.alert : focus ? c.brand : c.line,
          backgroundColor: c.surface, paddingHorizontal: 16, fontSize: 17, color: c.text, fontFamily: "Figtree_500Medium",
        }, props.style]}
      />
      {error ? <T v="caption" tone="alert">{error}</T> : hint ? <T v="caption" tone="faint">{hint}</T> : null}
    </View>
  );
}

/** Photo with an instant blurhash placeholder and a cross-fade when the real image arrives. */
export function PhotoView({ photo, style, rounded = 0, priority }: { photo?: Photo | null; style?: ViewStyle; rounded?: number; priority?: "high" | "normal" | "low" }) {
  const { c } = useTheme();
  if (!photo) return <View style={[{ backgroundColor: c.raised, borderRadius: rounded }, style]} />;
  return (
    <Image
      source={{ uri: mediaUrl(photo.url) }}
      placeholder={{ blurhash: photo.blurhash }}
      contentFit="cover"
      transition={180}
      priority={priority}
      cachePolicy="memory-disk"
      recyclingKey={photo.id}
      style={[{ borderRadius: rounded, backgroundColor: c.raised }, style as any]}
      accessibilityIgnoresInvertColors
    />
  );
}

export function Skeleton({ w, h, r = 12, style }: { w?: number | `${number}%`; h: number; r?: number; style?: ViewStyle }) {
  const { c } = useTheme();
  const o = useSharedValue(0.55);
  const reduced = useReducedMotion();
  useEffect(() => { if (!reduced) o.value = withRepeat(withTiming(1, { duration: 900 }), -1, true); }, [o, reduced]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View accessibilityElementsHidden style={[{ width: w ?? "100%", height: h, borderRadius: r, backgroundColor: c.raised }, s, style]} />;
}

/** Empty-state art: simple two-colour line drawings built from arcs — never stock couples. */
const ART: Record<string, (c: any) => ReactNode> = {
  bench: (c) => (<><Path d="M30 92h100M40 92v18M120 92v18M36 76h88" stroke={c.faint} strokeWidth={4} strokeLinecap="round" /><Path d="M58 70a14 14 0 0 1 0-28" stroke={c.brand} strokeWidth={5} strokeLinecap="round" fill="none" /><Path d="M102 42a14 14 0 0 1 0 28" stroke={c.accent} strokeWidth={5} strokeLinecap="round" fill="none" /></>),
  cups: (c) => (<><Path d="M40 60h30v26a10 10 0 0 1-10 10h-10a10 10 0 0 1-10-10z" stroke={c.brand} strokeWidth={4} fill="none" strokeLinejoin="round" /><Path d="M90 60h30v26a10 10 0 0 1-10 10h-10a10 10 0 0 1-10-10z" stroke={c.accent} strokeWidth={4} fill="none" strokeLinejoin="round" /><Path d="M50 50c0-8 8-8 8-16M100 50c0-8 8-8 8-16" stroke={c.faint} strokeWidth={3} strokeLinecap="round" fill="none" /><Path d="M28 104h104" stroke={c.faint} strokeWidth={4} strokeLinecap="round" /></>),
  door: (c) => (<><Path d="M56 108V30h48v78" stroke={c.faint} strokeWidth={4} strokeLinejoin="round" fill="none" /><Path d="M56 30l30 8v76l-30-6" stroke={c.brand} strokeWidth={4} strokeLinejoin="round" fill="none" /><Circle cx="78" cy="72" r="3" fill={c.accent} /><Path d="M110 50a18 18 0 0 1 0 30" stroke={c.accent} strokeWidth={4} strokeLinecap="round" fill="none" /></>),
};

export function EmptyState({ art = "bench", title, body, action }: { art?: keyof typeof ART; title: string; body: string; action?: { label: string; onPress: () => void } }) {
  const { c } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(260)} style={{ alignItems: "center", paddingHorizontal: 28, paddingVertical: 40, gap: 12 }}>
      <Svg width={160} height={130} viewBox="0 0 160 130" accessibilityElementsHidden>{ART[art](c)}</Svg>
      <T v="title" center>{title}</T>
      <T tone="muted" center>{body}</T>
      {action && <Button title={action.label} onPress={action.onPress} style={{ marginTop: 8 }} />}
    </Animated.View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: "center", padding: 32, gap: 10 }}>
      <T v="headline" center>Something went wrong.</T>
      <T tone="muted" center>{message ?? "Please try again."}</T>
      {onRetry && <Button title="Try again" v="outline" onPress={onRetry} style={{ marginTop: 6 }} />}
    </View>
  );
}

export function Banner({ tone = "info", children, onPress }: { tone?: "info" | "warn" | "alert" | "trust"; children: ReactNode; onPress?: () => void }) {
  const { c } = useTheme();
  const bg = { info: c.raised, warn: c.accentWash, alert: c.alertWash, trust: c.trustWash }[tone];
  const body = <View style={{ backgroundColor: bg, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>{typeof children === "string" ? <T v="callout">{children}</T> : children}</View>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress}>{body}</Pressable> : body;
}

/** Thin progress arc used for onboarding and profile completion. */
export function ProgressBar({ value }: { value: number }) {
  const { c } = useTheme();
  const w = useSharedValue(value);
  useEffect(() => { w.value = withTiming(value, { duration: 260 }); }, [value, w]);
  const s = useAnimatedStyle(() => ({ width: `${Math.max(4, Math.min(100, w.value))}%` }));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }} style={{ height: 6, borderRadius: 3, backgroundColor: c.raised, overflow: "hidden" }}>
      <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: c.accent }, s]} />
    </View>
  );
}

export function SheetHeader({ title, onClose, right }: { title?: string; onClose: () => void; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingTop: 8 }}>
      <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
      <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "stretch", paddingHorizontal: 12, paddingTop: 6, minHeight: 48 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Icon name="close" />
        </Pressable>
        <T v="headline" center style={{ flex: 1 }}>{title ?? ""}</T>
        <View style={{ minWidth: 44, alignItems: "flex-end" }}>{right}</View>
      </View>
    </View>
  );
}
