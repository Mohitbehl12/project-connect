import { forwardRef, useImperativeHandle } from "react";
import { useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { interpolate, useAnimatedReaction, useAnimatedStyle, useReducedMotion, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { haptic } from "@/lib/haptics";
import type { Card } from "@/lib/types";
import { DiscoveryCard } from "./DiscoveryCard";

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

  const fling = (d: Decision) => {
    "worklet";
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
  const tap = Gesture.Tap().maxDuration(250).onEnd((_e, ok) => { if (ok && top) scheduleOnRN(onOpen, top); });
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
    <View style={{ flex: 1 }}>
      {next && (
        <Animated.View key={`next-${next.id}`} style={[{ position: "absolute", inset: 0, borderRadius: 28 }, nextStyle]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <DiscoveryCard card={next} threshold={threshold} />
        </Animated.View>
      )}
      {top && (
        <GestureDetector gesture={gesture}>
          <Animated.View key={`top-${top.id}`} style={[{ position: "absolute", inset: 0, borderRadius: 28, shadowColor: "#12112A", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 }, topStyle]}
            accessibilityActions={[{ name: "activate", label: "Open profile" }, { name: "magicTap", label: "Like" }, { name: "like", label: "Like" }, { name: "pass", label: "Pass" }]}
            onAccessibilityAction={(e) => {
              const n = e.nativeEvent.actionName;
              if (n === "activate") onOpen(top);
              else if (n === "like" || n === "magicTap") fling("LIKE");
              else if (n === "pass") fling("PASS");
            }}>
            <DiscoveryCard card={top} drag={x} threshold={threshold} />
          </Animated.View>
        </GestureDetector>
      )}
    </View>
  );
});
