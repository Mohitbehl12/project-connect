import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "./Icon";
import { T } from "./Text";

const KEY = "kn.moment";

/**
 * "Your Love Moment ❤️": at most once a day, built only from real numbers (likes and matches in the last
 * 24 hours). No invented admirers, no countdowns, no pressure — and it's one tap to dismiss.
 */
export function LoveMoment() {
  const { me } = useAuth();
  const { g } = useTheme();
  const [show, setShow] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => { AsyncStorage.getItem(KEY).then((d) => setShow(d !== today)).catch(() => setShow(true)); }, [today]);
  if (!show || !me?.moment) return null;
  const { newLikes24h: likes, newMatches24h: matches } = me.moment;
  const [line, go] = matches > 0 ? [`You have ${matches === 1 ? "a new match" : `${matches} new matches`} 💕 Say hello while it's fresh.`, "/matches"]
    : likes > 1 ? [`${likes} people liked you today ❤️`, "/likes"]
    : likes === 1 ? ["You have a new admirer ❤️", "/likes"]
    : ["Ready to discover someone special? 💕", null];
  const close = () => { setShow(false); AsyncStorage.setItem(KEY, today).catch(() => {}); };
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOut} style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Your Love Moment. ${line}`} onPress={() => { close(); if (go) router.push(go as never); }}>
        <LinearGradient colors={[g.sunset[0], g.sunset[2]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <T style={{ fontSize: 30 }} accessibilityElementsHidden>❤️</T>
          <View style={{ flex: 1 }}>
            <T v="caption" strong style={{ color: "rgba(255,255,255,0.85)" }}>YOUR LOVE MOMENT</T>
            <T v="callout" strong style={{ color: "#FFFFFF" }}>{line}</T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={12} onPress={close}><Icon name="close" size={18} color="#FFFFFF" /></Pressable>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
