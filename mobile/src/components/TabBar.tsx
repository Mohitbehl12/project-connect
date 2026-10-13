import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import type { MatchRow } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";
import { Glass } from "./Ambient";
import { Icon, type IconName } from "./Icon";
import { T } from "./Text";

const TABS: Record<string, { label: string; icon: IconName }> = {
  discover: { label: "Discover", icon: "discover" },
  likes: { label: "Likes", icon: "likes" },
  matches: { label: "Matches", icon: "matches" },
  messages: { label: "Messages", icon: "messages" },
  profile: { label: "Profile", icon: "profile" },
};

/**
 * Floating glass tab bar. A soft brand-coloured lozenge springs to the selected tab;
 * a small marigold arc sits above the selected icon — the brand mark in miniature.
 */
export function TabBar({ state, navigation }: { state: any; navigation: any }) {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const matches = useQuery({ queryKey: ["matches"], queryFn: () => api<{ matches: MatchRow[] }>("/api/matches"), staleTime: 30_000 });
  const unread = (matches.data?.matches ?? []).reduce((s, m) => s + m.unread, 0);
  const fresh = (matches.data?.matches ?? []).filter((m) => !m.lastMessage).length;
  const routes = state.routes.filter((r: any) => TABS[r.name]);
  const tabW = w / Math.max(1, routes.length);
  const x = useSharedValue(0);
  useEffect(() => { x.value = withSpring(state.index * tabW, { damping: 20, stiffness: 220 }); }, [state.index, tabW, x]);
  const lozenge = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 14, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 10) }}>
      <Glass radius={32} intensity={60} style={{ shadowColor: "#12112A", shadowOpacity: dark ? 0.5 : 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
        <View accessibilityRole="tablist" onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: "row", height: 64 }}>
          {w > 0 && (
            <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 7, left: 0, width: tabW, height: 50, alignItems: "center" }, lozenge]}>
              <View style={{ width: Math.min(tabW - 8, 76), height: 50, borderRadius: 25, backgroundColor: dark ? "rgba(143,136,240,0.22)" : "rgba(46,42,110,0.08)" }} />
            </Animated.View>
          )}
          {routes.map((route: any) => {
            const i = state.routes.indexOf(route);
            const tab = TABS[route.name];
            const focused = state.index === i;
            const badge = route.name === "messages" ? unread : route.name === "matches" ? fresh : 0;
            return (
              <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={badge ? `${tab.label}, ${badge} new` : tab.label}
                onPress={() => {
                  const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !e.defaultPrevented) { haptic.tick(); navigation.navigate(route.name); }
                }}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }}>
                <View>
                  <Icon name={tab.icon} size={25} color={focused ? c.brand : c.faint} stroke={focused ? 2.2 : 1.75} filled={focused && tab.icon === "likes"} />
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
