import { ActivityIndicator, Pressable, View, type PressableProps, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useFx } from "@/lib/fx";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";
import { Icon, type IconName } from "./Icon";
import { T } from "./Text";

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger";

/** Press feedback shared by every tappable: a 120 ms scale to 0.97. */
export function usePressScale() {
  const s = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return { style, onPressIn: () => (s.value = withTiming(0.97, { duration: 120 })), onPressOut: () => (s.value = withTiming(1, { duration: 120 })) };
}

export function Button({ title, onPress, v = "primary", icon, loading, disabled, full, size = "md", style, textColor, ...rest }: Omit<PressableProps, "style"> & {
  title: string; v?: Variant; icon?: IconName; loading?: boolean; full?: boolean; size?: "md" | "lg"; style?: ViewStyle; textColor?: string;
}) {
  const { c } = useTheme();
  const press = usePressScale();
  const bg = { primary: c.brand, accent: c.accent, outline: c.surface, ghost: "transparent", danger: c.alert }[v];
  const fg = textColor ?? { primary: c.brandText, accent: c.accentText, outline: c.text, ghost: c.text, danger: "#FFFFFF" }[v];
  const h = size === "lg" ? 56 : 48;
  return (
    <Animated.View style={[press.style, full && { alignSelf: "stretch" }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
        disabled={disabled || loading}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={(e) => { haptic.light(); onPress?.(e); }}
        style={{
          height: h, paddingHorizontal: 22, borderRadius: 999, backgroundColor: bg, flexDirection: "row", gap: 8,
          alignItems: "center", justifyContent: "center", opacity: disabled ? 0.45 : 1,
          borderWidth: v === "outline" ? 1.5 : 0, borderColor: c.line,
        }}
        {...rest}
      >
        {loading ? <ActivityIndicator color={fg} /> : (
          <>
            {icon && <Icon name={icon} size={20} color={fg} />}
            <T v="callout" style={{ color: fg, fontSize: size === "lg" ? 17 : 15 }}>{title}</T>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function IconButton({ icon, label, onPress, size = 48, tone = "surface", iconColor, filled, disabled }: {
  icon: IconName; label: string; onPress?: () => void; size?: number; tone?: "surface" | "brand" | "accent" | "glass" | "none"; iconColor?: string; filled?: boolean; disabled?: boolean;
}) {
  const { c } = useTheme();
  const press = usePressScale();
  const bg = { surface: c.surface, brand: c.brand, accent: c.accent, glass: "rgba(22,17,42,0.35)", none: "transparent" }[tone];
  const col = iconColor ?? { surface: c.text, brand: c.brandText, accent: c.accentText, glass: "#FFFFFF", none: c.text }[tone];
  // Micro-animations: the gear turns, the bell rings gently, search expands (≈300 ms; none with reduced motion).
  const { motion } = useFx();
  const spin = useSharedValue(0);
  const kick = () => {
    if (!motion) return;
    if (icon === "settings") spin.value = withSequence(withTiming(1, { duration: 360 }), withTiming(0, { duration: 0 }));
    else if (icon === "bell") spin.value = withSequence(withTiming(0.12, { duration: 70 }), withTiming(-0.12, { duration: 90 }), withTiming(0.06, { duration: 80 }), withTiming(0, { duration: 80 }));
  };
  const iconAnim = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * (icon === "settings" ? 90 : 180)}deg` }] }));
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
        onPressIn={press.onPressIn} onPressOut={press.onPressOut}
        onPress={() => { haptic.light(); kick(); onPress?.(); }}
        hitSlop={size < 44 ? (44 - size) / 2 : 0}
        style={{
          width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center",
          borderWidth: tone === "surface" ? 1.5 : 0, borderColor: c.line, opacity: disabled ? 0.4 : 1,
        }}
      >
        <Animated.View style={iconAnim}><Icon name={icon} size={size * 0.46} color={col} filled={filled} /></Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export function Row({ children, gap = 8, style }: { children: React.ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}
