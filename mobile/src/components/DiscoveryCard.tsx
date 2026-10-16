import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useDerivedValue, type SharedValue } from "react-native-reanimated";
import type { Card } from "@/lib/types";
import { CompatArc } from "./Arc";
import { Icon, VerifiedBadge } from "./Icon";
import { T } from "./Text";
import { PhotoView } from "./ui";
import { useTheme } from "@/theme/ThemeProvider";
import { alpha } from "@/theme/themes";

/**
 * Immersive card. The photo fills it; the compatibility arc glows top-right; name, intent, shared
 * interests and one reason sit on a deep scrim at the bottom. Dragging right blooms a warm sunset
 * glyph and "closes" the arc; dragging left blooms a cool pass glyph. No stamps or labels.
 */
export function DiscoveryCard({ card, drag, threshold, photoIndex = 0, bottomInset = 0 }: {
  card: Card; drag?: SharedValue<number>; threshold: number; photoIndex?: number; bottomInset?: number;
}) {
  const { c, g } = useTheme();
  const closing = useDerivedValue(() => (drag ? Math.max(0, Math.min(1, drag.value / threshold)) : 0));
  const likeGlow = useAnimatedStyle(() => ({ opacity: drag ? interpolate(drag.value, [0, threshold], [0, 1], "clamp") : 0 }));
  const likeGlyph = useAnimatedStyle(() => {
    const p = drag ? interpolate(drag.value, [threshold * 0.2, threshold], [0, 1], "clamp") : 0;
    return { opacity: p, transform: [{ scale: 0.6 + p * 0.5 }, { rotate: `${-12 + p * 12}deg` }] };
  });
  const passGlyph = useAnimatedStyle(() => {
    const p = drag ? interpolate(drag.value, [-threshold, -threshold * 0.2], [1, 0], "clamp") : 0;
    return { opacity: p, transform: [{ scale: 0.6 + p * 0.5 }, { rotate: `${12 - p * 12}deg` }] };
  });
  const passWash = useAnimatedStyle(() => ({ opacity: drag ? interpolate(drag.value, [-threshold, 0], [0.35, 0], "clamp") : 0 }));

  const photo = card.photos[Math.min(photoIndex, Math.max(0, card.photos.length - 1))];
  const reason = card.trait ?? card.reasons?.find((r) => !r.startsWith("You both enjoy") && !r.startsWith("Both in") && r !== "Verified profile") ?? card.reasons?.[0];
  // Second and later photos show more of the profile on the card itself, like turning a page.
  const page = photoIndex % 3;

  return (
    <View
      accessible
      accessibilityLabel={`${card.firstName}, ${card.age}, ${card.city}${card.verified ? ", verified" : ""}, ${card.score ?? ""} percent compatible, ${card.intent}. ${reason ?? ""}`}
      accessibilityHint="Double tap to open profile. Tap the left or right side of the photo to see more photos."
      style={{ flex: 1, borderRadius: 32, overflow: "hidden", backgroundColor: g.nightRaised }}>
      <PhotoView photo={photo} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any} priority="high" />
      <LinearGradient colors={["rgba(22,17,42,0.45)", "transparent"]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 120 }} />

      {card.photos.length > 1 && (
        <View style={{ position: "absolute", top: 10, left: 14, right: 14, flexDirection: "row", gap: 4 }} accessibilityElementsHidden>
          {card.photos.map((p, i) => <View key={p.id} style={{ flex: 1, height: 3.5, borderRadius: 2, backgroundColor: i === photoIndex ? "#FFFFFF" : "rgba(255,255,255,0.35)" }} />)}
        </View>
      )}

      {card.score !== undefined && (
        <View style={{ position: "absolute", top: 24, right: 14, alignItems: "center", gap: 2 }}>
          <View style={{ borderRadius: 40, padding: 5, backgroundColor: alpha(g.night, 0.38), shadowColor: g.spark, shadowOpacity: 0.35, shadowRadius: 14 }}>
            <CompatArc score={card.score} size={62} live={closing} onDark />
          </View>
          <T v="caption" tone="white" style={{ fontSize: 10.5, letterSpacing: 0.3, opacity: 0.9, fontFamily: "Figtree_700Bold" }}>match</T>
        </View>
      )}

      <LinearGradient colors={["transparent", "rgba(22,17,42,0.6)", "rgba(12,11,30,0.97)"]} locations={[0, 0.38, 1]}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 140, paddingHorizontal: 20, paddingBottom: 20 + bottomInset, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
          <T v="display" tone="white" numberOfLines={1} style={{ flexShrink: 1, fontSize: 40, lineHeight: 44, textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 12 }}>
            {card.firstName}<T tone="white" style={{ fontFamily: "BricolageGrotesque_700Bold", fontSize: 32, lineHeight: 44, opacity: 0.92 }}>  {card.age}</T>
          </T>
          {card.verified && <View style={{ marginBottom: 9 }}><VerifiedBadge size={24} /></View>}
        </View>

        {page === 1 && card.bio ? (
          <T v="callout" tone="white" numberOfLines={4} style={{ opacity: 0.95 }}>{card.bio}</T>
        ) : page === 2 && card.prompts[1] ? (
          <View style={{ gap: 2 }}>
            <T v="caption" style={{ color: g.spark }}>{card.prompts[1].q}</T>
            <T v="headline" tone="white" numberOfLines={3} style={{ fontFamily: "BricolageGrotesque_700Bold", fontSize: 21, lineHeight: 26 }}>{card.prompts[1].a}</T>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="pin" size={16} color="rgba(255,255,255,0.85)" />
              <T v="callout" tone="white" style={{ opacity: 0.88 }}>{card.city} · {card.distance}</T>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: c.accent }}>
                <T v="caption" style={{ color: c.accentText, fontFamily: "Figtree_700Bold" }}>{card.intent}</T>
              </View>
              {card.shared.slice(0, 3).map((s) => (
                <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }}>
                  <T v="caption">{s.emoji}</T><T v="caption" tone="white" style={{ fontFamily: "Figtree_600SemiBold" }}>{s.label}</T>
                </View>
              ))}
            </View>
            {card.prompts[0] && (
              <T v="callout" tone="white" numberOfLines={2} style={{ fontFamily: "BricolageGrotesque_700Bold", fontSize: 17, lineHeight: 22 }}>“{card.prompts[0].a}”</T>
            )}
            {reason && (
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 2 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(127,209,176,0.22)", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="check" size={14} color="#7FD1B0" stroke={2.6} />
                </View>
                <T v="callout" tone="white" style={{ flex: 1 }} numberOfLines={2}>{reason}</T>
              </View>
            )}
          </>
        )}
      </LinearGradient>

      {/* drag feedback */}
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 32, borderWidth: 5, borderColor: g.spark }, likeGlow]} />
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.raised }, passWash]} />
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: "30%", left: 28, width: 96, height: 96, borderRadius: 48, overflow: "hidden", alignItems: "center", justifyContent: "center" }, likeGlyph]}>
        <LinearGradient colors={[...g.sunset]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
        <Icon name="likes" size={48} color="#FFF" filled />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: "30%", right: 28, width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.92)" }, passGlyph]}>
        <Icon name="pass" size={44} color={c.text} stroke={2.6} />
      </Animated.View>
    </View>
  );
}
