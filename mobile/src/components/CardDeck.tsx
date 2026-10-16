import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, interpolate, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { haptic } from "@/lib/haptics";
import type { Card } from "@/lib/types";
import { DiscoveryCard } from "./DiscoveryCard";
import { Icon } from "./Icon";

export type Decision = "LIKE" | "PASS";
export type DeckHandle = { swipe: (d: Decision) => void };

type Props = {
  top?: Card;
  next?: Card;
  x: SharedValue<number>;
  onDecision: (d: Decision, card: Card) => void;
  onOpen: (card: Card) => void;
  onOptions: (card: Card) => void;
};

/**
 * Two-card stack. The top card follows the finger (tilt up to 8°), commits past 30% of the width
 * or on a fast flick, and the next card grows from 96% as the top one leaves. Every gesture has a
 * button equivalent (see the action bar), so nothing depends on swiping.
 */
export const CardDeck = forwardRef<DeckHandle, Props>(function CardDeck({ top, next, x, onDecision, onOpen, onOptions }, ref) {
  const { width } = useWindowDimensions();
  const threshold = width * 0.3;
  const reduced = useReducedMotion();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [photoIndex, setPhotoIndex] = useState(0);
  useEffect(() => setPhotoIndex(0), [top?.id]);
  const burst = useSharedValue(0);
  const photos = top?.photos.length ?? 0;
  const step = (dir: 1 | -1) => {
    const n = photoIndex + dir;
    if (n < 0 || n >= photos) { haptic.tick(); return; } // a soft bump at either end
    haptic.tick();
    setPhotoIndex(n);
  };

  const fling = (d: Decision) => {
    "worklet";
    if (d === "LIKE" && !reduced) { burst.value = 0; burst.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }); }
    const to = (d === "LIKE" ? 1 : -1) * width * 1.4;
    x.value = withTiming(to, { duration: reduced ? 120 : 220 }, (done) => {
      if (done && top) scheduleOnRN(onDecision, d, top);
    });
  };

  useImperativeHandle(ref, () => ({ swipe: (d) => { if (top) { haptic.light(); fling(d); } } }), [top, width]);

  // A tick when the drag crosses the like/pass threshold.
  useAnimatedReaction(
    () => (x.value > threshold ? 1 : x.value < -threshold ? -1 : 0),
    (now, prev) => { if (prev !== null && now !== prev && now !== 0) scheduleOnRN(haptic.tick); },
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-24, 24])
    .onUpdate((e) => { x.value = e.translationX; })
    .onEnd((e) => {
      if (x.value > threshold || e.velocityX > 900) { scheduleOnRN(haptic.light); fling("LIKE"); }
      else if (x.value < -threshold || e.velocityX < -900) { scheduleOnRN(haptic.light); fling("PASS"); }
      else x.value = withSpring(0, { damping: 18, stiffness: 180 });
    });
  // Tap the left or right edge of the photo to browse photos; tap the middle or the text to open the profile.
  const tap = Gesture.Tap().maxDuration(250).onEnd((e, ok) => {
    if (!ok || !top) return;
    const inPhoto = box.h > 0 && e.y < box.h * 0.62;
    if (inPhoto && e.x < box.w * 0.33) scheduleOnRN(step, -1);
    else if (inPhoto && e.x > box.w * 0.67) scheduleOnRN(step, 1);
    else scheduleOnRN(onOpen, top);
  });
  const hold = Gesture.LongPress().minDuration(400).onStart(() => { if (top) { scheduleOnRN(haptic.medium); scheduleOnRN(onOptions, top); } });
  const gesture = Gesture.Race(pan, Gesture.Exclusive(hold, tap));

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: Math.abs(x.value) * 0.04 },
      { rotate: reduced ? "0deg" : `${interpolate(x.value, [-width, 0, width], [-8, 0, 8], "clamp")}deg` },
    ],
  }));
  const nextStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(Math.abs(x.value), [0, threshold], [0.96, 1], "clamp") }],
    opacity: interpolate(Math.abs(x.value), [0, threshold], [0.7, 1], "clamp"),
  }));

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {next && (
        <Animated.View key={`next-${next.id}`} style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 32 }, nextStyle]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <DiscoveryCard card={next} threshold={threshold} />
        </Animated.View>
      )}
      {top && (
        <GestureDetector gesture={gesture}>
          <Animated.View key={`top-${top.id}`} style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 32, shadowColor: "#16112A", shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 }, topStyle]}
            accessibilityActions={[{ name: "activate", label: "Open profile" }, { name: "magicTap", label: "Like" }, { name: "like", label: "Like" }, { name: "pass", label: "Pass" }]}
            onAccessibilityAction={(e) => {
              const n = e.nativeEvent.actionName;
              if (n === "activate") onOpen(top);
              else if (n === "like" || n === "magicTap") fling("LIKE");
              else if (n === "pass") fling("PASS");
            }}>
            <DiscoveryCard card={top} drag={x} threshold={threshold} photoIndex={photoIndex} />
          </Animated.View>
        </GestureDetector>
      )}
      <LikeBurst progress={burst} />
    </View>
  );
});

const BURST = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
  return { a, d: 110 + (i % 3) * 38, s: 14 + (i % 4) * 5, c: ["#7FD8BE", "#A98BEA", "#8E5BD8", "#C3A6FF"][i % 4], heart: i % 3 === 0 };
});

/** A short, one-shot bloom of warm particles when you like someone. Off under Reduce Motion. */
export function LikeBurst({ progress, top = "42%", spread = 1 }: { progress: SharedValue<number>; top?: `${number}%`; spread?: number }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: "50%", top, transform: [{ scale: spread }] }}>
      {BURST.map((p, i) => <Particle key={i} p={p} progress={progress} />)}
    </View>
  );
}

function Particle({ p, progress }: { p: (typeof BURST)[number]; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const live = t > 0 && t < 1;
    return {
      opacity: live ? interpolate(t, [0, 0.15, 0.7, 1], [0, 1, 1, 0]) : 0,
      transform: [
        { translateX: Math.cos(p.a) * p.d * t },
        { translateY: Math.sin(p.a) * p.d * t - 40 * t * t },
        { scale: interpolate(t, [0, 0.3, 1], [0.3, 1.15, 0.6]) },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: "absolute", marginLeft: -p.s / 2, marginTop: -p.s / 2 }, style]}>
      {p.heart ? <Icon name="likes" size={p.s + 6} color={p.c} filled /> : <View style={{ width: p.s * 0.6, height: p.s * 0.6, borderRadius: p.s, backgroundColor: p.c }} />}
    </Animated.View>
  );
}
