import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";
import { T } from "./Text";

/** A question between two poles: five stops, a haptic tick on each, labels at both ends. */
export function PoleSlider({ left, right, value, onChange }: { left: string; right: string; value?: number; onChange: (v: number) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}
        accessibilityRole="adjustable" accessibilityLabel={`${left} to ${right}`}
        accessibilityValue={{ min: 1, max: 5, now: value ?? 3 }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onChange(Math.max(1, Math.min(5, (value ?? 3) + (e.nativeEvent.actionName === "increment" ? 1 : -1))))}>
        <View style={{ position: "absolute", left: 24, right: 24, height: 4, borderRadius: 2, backgroundColor: c.raised }} />
        {[1, 2, 3, 4, 5].map((v) => <Stop key={v} on={value === v} edge={v === 1 || v === 5} onPress={() => { haptic.tick(); onChange(v); }} />)}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 16 }}>
        <T v="callout" tone={value && value < 3 ? "text" : "muted"} style={{ flex: 1 }}>{left}</T>
        <T v="callout" tone={value && value > 3 ? "text" : "muted"} style={{ flex: 1, textAlign: "right" }}>{right}</T>
      </View>
    </View>
  );
}

function Stop({ on, edge, onPress }: { on: boolean; edge: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const s = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(on ? 1 : edge ? 0.72 : 0.58, { damping: 14, stiffness: 220 }) }] }));
  return (
    <Pressable onPress={onPress} hitSlop={10} importantForAccessibility="no" style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ width: 44, height: 44, borderRadius: 22, backgroundColor: on ? c.brand : c.surface, borderWidth: on ? 0 : 2, borderColor: c.faint }, s]} />
    </Pressable>
  );
}
