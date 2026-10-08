import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useDerivedValue, type SharedValue } from "react-native-reanimated";
import type { Card } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";
import { CompatArc } from "./Arc";
import { VerifiedBadge } from "./Icon";
import { T } from "./Text";
import { Chip, PhotoView } from "./ui";

/**
 * The card face. Photo first; the compatibility arc and the reasons sit on the first view,
 * so every decision is made with a reason in view. Drag feedback is a warm marigold edge for
 * "like" and a cool mist wash for "pass" — no stamps or labels.
 */
export function DiscoveryCard({ card, drag, threshold }: { card: Card; drag?: SharedValue<number>; threshold: number }) {
  const { c } = useTheme();
  const progress = useAnimatedStyle(() => ({ opacity: drag ? interpolate(drag.value, [0, threshold], [0, 1], "clamp") : 0 }));
  const passWash = useAnimatedStyle(() => ({ opacity: drag ? interpolate(drag.value, [-threshold, 0], [0.55, 0], "clamp") : 0 }));
  // A right drag "closes" the compatibility ring — the Arc as swipe feedback.
  const closing = useDerivedValue(() => (drag ? Math.max(0, Math.min(1, drag.value / threshold)) : 0));
  const reason = card.trait ?? card.reasons?.find((r) => !r.startsWith("You both enjoy") && !r.startsWith("Both in") && r !== "Verified profile") ?? card.reasons?.[0];

  return (
    <View
      accessible
      accessibilityLabel={`${card.firstName}, ${card.age}, ${card.city}${card.verified ? ", verified" : ""}, ${card.score ?? ""} percent compatible, ${card.intent}. ${reason ?? ""}`}
      accessibilityHint="Double tap to open profile. Use the buttons below to like or pass."
      style={{ flex: 1, borderRadius: 28, overflow: "hidden", backgroundColor: c.raised }}>
      <PhotoView photo={card.photos[0]} style={{ position: "absolute", inset: 0 } as any} priority="high" />
      {card.photos.length > 1 && (
        <View style={{ position: "absolute", top: 14, left: 14, backgroundColor: "rgba(18,17,42,0.45)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <T v="caption" tone="white">1 of {card.photos.length}</T>
        </View>
      )}
      {card.score !== undefined && (
        <View style={{ position: "absolute", top: 12, right: 12, borderRadius: 40, padding: 6, backgroundColor: "rgba(18,17,42,0.42)" }}>
          <CompatArc score={card.score} size={60} live={closing} onDark />
        </View>
      )}

      <LinearGradient colors={["transparent", "rgba(18,17,42,0.55)", "rgba(18,17,42,0.94)"]} locations={[0, 0.35, 1]}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 120, paddingHorizontal: 18, paddingBottom: 18, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T v="display" tone="white" numberOfLines={1} style={{ flexShrink: 1 }}>{card.firstName}, {card.age}</T>
          {card.verified && <VerifiedBadge size={22} />}
        </View>
        <T v="callout" tone="white" style={{ opacity: 0.85 }}>{card.city} · {card.distance}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Chip small label={card.intent} tone="accent" />
          {card.shared.slice(0, 3).map((s) => <Chip key={s.key} small label={s.label} emoji={s.emoji} tone="glass" />)}
        </View>
        {reason && (
          <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: 2 }}>
            <T v="callout" style={{ color: "#7FD1B0" }}>✓</T>
            <T v="callout" tone="white" style={{ flex: 1 }} numberOfLines={2}>{reason}</T>
          </View>
        )}
      </LinearGradient>

      {/* Drag feedback layers */}
      <Animated.View pointerEvents="none" style={[{ position: "absolute", inset: 0, borderRadius: 28, borderWidth: 6, borderColor: c.accent }, progress]} />
      <Animated.View pointerEvents="none" style={[{ position: "absolute", inset: 0, backgroundColor: "#D9D7E8" }, passWash]} />
    </View>
  );
}
