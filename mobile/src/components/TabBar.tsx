import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import type { MatchRow } from "@/lib/types";
import { alpha } from "@/theme/themes";
import { useTheme } from "@/theme/ThemeProvider";
import { Glass } from "./Ambient";
import { Icon, type IconName } from "./Icon";
import { LuxIcon } from "./LuxIcon";
import { T } from "./Text";

// Member tabs use the luxury icon set (LuxIcon); other bars (e.g. staff) may pass plain icons.
const TABS: Record<string, { label: string; icon: IconName; lux?: string }> = {
  discover: { label: "Home", icon: "discover", lux: "home" },
  explore: { label: "Explore", icon: "explore", lux: "explore" },
  matches: { label: "Matches", icon: "matches", lux: "matches" },
  messages: { label: "Messages", icon: "messages", lux: "messages" },
  profile: { label: "Profile", icon: "profile", lux: "profile" },
};

/** A tiny sparkle of light under the selected icon. */
function Glint({ on, color }: { on: boolean; color: string }) {
  const o = useSharedValue(on ? 1 : 0);
  useEffect(() => { o.value = withTiming(on ? 1 : 0, { duration: 300 }); }, [on, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scaleX: 0.4 + o.value * 0.6 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", bottom: -4, alignSelf: "center", width: 14, height: 2, borderRadius: 2, backgroundColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }, st]} />;
}

/**
 * Floating glass tab bar. A soft brand-coloured lozenge springs to the selected tab;
 * a small marigold arc sits above the selected icon — the brand mark in miniature.
 */
export function TabBar({ state, navigation, tabs = TABS, accent }: { state: any; navigation: any; tabs?: Record<string, { label: string; icon: IconName; lux?: string }>; accent?: string }) {
  const { c: base, dark, g } = useTheme();
  const c = accent ? { ...base, brand: accent } : base;
  const TABS_ = tabs;
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const matches = useQuery({ queryKey: ["matches"], queryFn: () => api<{ matches: MatchRow[] }>("/api/matches"), staleTime: 30_000 });
  const unread = (matches.data?.matches ?? []).reduce((s, m) => s + m.unread, 0);
  const fresh = (matches.data?.matches ?? []).filter((m) => !m.lastMessage).length;
  const likes = useQuery({ queryKey: ["likes"], queryFn: () => api<{ total: number }>("/api/likes"), staleTime: 60_000 });
  const routes = state.routes.filter((r: any) => TABS_[r.name]);
  const tabW = w / Math.max(1, routes.length);
  const x = useSharedValue(0);
  useEffect(() => { x.value = withSpring(state.index * tabW, { damping: 20, stiffness: 220 }); }, [state.index, tabW, x]);
  const lozenge = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 14, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 10) }}>
      <Glass radius={32} intensity={60} style={{ shadowColor: g.night, shadowOpacity: dark ? 0.5 : 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
        <View accessibilityRole="tablist" onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: "row", height: 64 }}>
          {w > 0 && (
            <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 7, left: 0, width: tabW, height: 50, alignItems: "center" }, lozenge]}>
              <View style={{ width: Math.min(tabW - 8, 76), height: 50, borderRadius: 25, backgroundColor: dark ? alpha(accent ?? g.spark2, 0.22) : alpha(c.brand, 0.1) }} />
            </Animated.View>
          )}
          {routes.map((route: any) => {
            const i = state.routes.indexOf(route);
            const tab = TABS_[route.name];
            const focused = state.index === i;
            const badge = route.name === "messages" ? unread : route.name === "matches" ? fresh + (likes.data?.total ?? 0) : 0;
            return (
              <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={badge ? `${tab.label}, ${badge} new` : tab.label}
                onPress={() => {
                  const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !e.defaultPrevented) { haptic.tick(); navigation.navigate(route.name); }
                }}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 5 }}>
                <View>
                  {tab.lux ? (
                    <View style={focused ? { borderRadius: 999, shadowColor: g.sunset[0], shadowOpacity: dark ? 0.75 : 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } } : undefined}>
                      <LuxIcon name={tab.lux} size={26} active={focused} color={c.faint} stroke={focused ? 1.7 : 1.5} />
                    </View>
                  ) : <Icon name={tab.icon} size={25} color={focused ? c.brand : c.faint} stroke={focused ? 2.2 : 1.75} filled={false} />}
                  {tab.lux && <Glint on={focused} color={c.accent} />}
                  {badge > 0 && (
                    <View style={{ position: "absolute", right: -10, top: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.alert, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface }}>
                      <T v="caption" style={{ color: "#FFF", fontSize: 10, lineHeight: 12, fontFamily: "Figtree_700Bold" }}>{badge > 9 ? "9+" : badge}</T>
                    </View>
                  )}
                </View>
                <T v="caption" style={{ fontSize: 10.5, lineHeight: 13, color: focused ? c.text : c.faint, fontFamily: focused ? "Figtree_700Bold" : "Figtree_600SemiBold" }}>{tab.label}</T>
              </Pressable>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}
