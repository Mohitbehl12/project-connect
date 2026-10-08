import { useQuery } from "@tanstack/react-query";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import type { MatchRow } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, type IconName } from "./Icon";
import { T } from "./Text";

const TABS: Record<string, { label: string; icon: IconName }> = {
  discover: { label: "Discover", icon: "discover" },
  likes: { label: "Likes", icon: "likes" },
  matches: { label: "Matches", icon: "matches" },
  messages: { label: "Messages", icon: "messages" },
  profile: { label: "Profile", icon: "profile" },
};

/** Bottom navigation: the selected tab is marked by a small marigold arc above its icon. */
export function TabBar({ state, navigation }: { state: any; navigation: any }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const matches = useQuery({ queryKey: ["matches"], queryFn: () => api<{ matches: MatchRow[] }>("/api/matches"), staleTime: 30_000 });
  const unread = (matches.data?.matches ?? []).reduce((s, m) => s + m.unread, 0);
  const fresh = (matches.data?.matches ?? []).filter((m) => !m.lastMessage).length;

  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: c.tab, borderTopWidth: 1, borderTopColor: c.line, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 6 }}>
      {state.routes.map((route: any, i: number) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === i;
        const badge = route.name === "messages" ? unread : route.name === "matches" ? fresh : 0;
        return (
          <TabItem key={route.key} label={tab.label} icon={tab.icon} focused={focused} badge={badge}
            onPress={() => {
              const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) { haptic.tick(); navigation.navigate(route.name); }
            }} />
        );
      })}
    </View>
  );
}

function TabItem({ label, icon, focused, badge, onPress }: { label: string; icon: IconName; focused: boolean; badge: number; onPress: () => void }) {
  const { c } = useTheme();
  const arc = useAnimatedStyle(() => ({ opacity: withSpring(focused ? 1 : 0), transform: [{ scale: withSpring(focused ? 1 : 0.6, { damping: 16 }) }] }));
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={badge ? `${label}, ${badge} new` : label}
      onPress={onPress} style={{ flex: 1, alignItems: "center", paddingVertical: 4, minHeight: 52, gap: 2 }}>
      <Animated.View style={[{ height: 6 }, arc]}>
        <Svg width={22} height={6}><Path d="M2 5 Q11 -1 20 5" stroke={c.accent} strokeWidth={2.4} strokeLinecap="round" fill="none" /></Svg>
      </Animated.View>
      <View>
        <Icon name={icon} size={26} color={focused ? c.brand : c.faint} stroke={focused ? 2.1 : 1.75} />
        {badge > 0 && (
          <View style={{ position: "absolute", right: -9, top: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.alert, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.tab }}>
            <T v="caption" style={{ color: "#FFF", fontSize: 10, lineHeight: 12, fontFamily: "Figtree_700Bold" }}>{badge > 9 ? "9+" : badge}</T>
          </View>
        )}
      </View>
      <T v="caption" style={{ fontSize: 11, lineHeight: 14, color: focused ? c.text : c.faint, fontFamily: focused ? "Figtree_700Bold" : "Figtree_500Medium" }}>{label}</T>
    </Pressable>
  );
}
