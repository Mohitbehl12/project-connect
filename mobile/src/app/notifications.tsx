import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, SectionList, View } from "react-native";
import { Header } from "@/components/Header";
import { Icon, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { EmptyState, ErrorState, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useTheme } from "@/theme/ThemeProvider";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useFx } from "@/lib/fx";

/** The moment's emoji (wink, Spark, Super Like, match, call yes, heart), pulsing once when it's new. */
function EmojiBadge({ emoji, fresh }: { emoji: string; fresh: boolean }) {
  const { c } = useTheme();
  const { motion } = useFx();
  const sc = useSharedValue(1);
  useEffect(() => { if (fresh && motion) sc.value = withRepeat(withSequence(withTiming(1.25, { duration: 220 }), withTiming(1, { duration: 260 })), 3); }, [fresh, motion, sc]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  return (
    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.brandWash, alignItems: "center", justifyContent: "center" }}>
      <Animated.Text style={[{ fontSize: 22 }, st]} accessibilityElementsHidden>{emoji}</Animated.Text>
    </View>
  );
}
const momentEmoji = (title: string) => (/📞/.test(title) ? "📞" : /😉/.test(title) ? "😉" : /✨/.test(title) ? "✨" : /⭐/.test(title) ? "⭐" : /💕/.test(title) ? "💕" : /❤️/.test(title) ? "❤️" : null);

type N = { id: string; type: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };
const ICON: Record<string, [IconName, "accent" | "brand" | "trust" | "alert"]> = {
  MATCH: ["matches", "accent"], MESSAGE: ["messages", "brand"], LIKE: ["likes", "alert"], VERIFICATION: ["shield", "trust"],
  DATE: ["calendar", "accent"], SUBSCRIPTION: ["sparkle", "brand"], SECURITY: ["lock", "alert"], REPORT: ["shield", "trust"], MODERATION: ["flag", "alert"],
};

/** Web paths in notifications map onto app routes. */
function open(link: string | null) {
  if (!link) return;
  const m = link.match(/^\/matches\/([\w-]+)/);
  if (m) router.push({ pathname: "/chat/[id]", params: { id: m[1] } });
  else if (link.startsWith("/likes")) router.push("/likes");
  else if (link.startsWith("/settings")) router.push("/settings");
  else if (link.startsWith("/plans")) router.push("/premium");
}

export default function Notifications() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ notifications: N[] }>("/api/notifications") });
  useEffect(() => {
    if (q.data?.notifications.some((n) => !n.readAt)) api("/api/notifications", { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: ["me"] })).catch(() => {});
  }, [q.data, qc]);

  const today = new Date().toDateString();
  const sections = q.data ? [
    { title: "Today", data: q.data.notifications.filter((n) => new Date(n.createdAt).toDateString() === today) },
    { title: "Earlier", data: q.data.notifications.filter((n) => new Date(n.createdAt).toDateString() !== today) },
  ].filter((s) => s.data.length) : [];

  return (
    <Screen>
      <Header title="Notifications" />
      {q.isLoading && <View style={{ gap: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={72} r={20} />)}</View>}
      {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && !q.data.notifications.length && <EmptyState art="bench" title="All quiet" body="Matches, messages and updates about your account will show up here." />}
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        renderSectionHeader={({ section }) => <T v="callout" tone="muted" style={{ marginTop: 8 }}>{section.title}</T>}
        renderItem={({ item: n }) => {
          const [icon, tone] = ICON[n.type] ?? ["bell", "brand"];
          const emoji = momentEmoji(n.title);
          return (
            <Pressable accessibilityRole={n.link ? "button" : undefined} onPress={() => open(n.link)}
              style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: c.surface, borderRadius: 20, padding: 14 }}>
              {emoji ? <EmojiBadge emoji={emoji} fresh={!n.readAt} /> : (
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: tone === "accent" ? c.accentWash : tone === "trust" ? c.trustWash : tone === "alert" ? c.alertWash : c.raised, alignItems: "center", justifyContent: "center" }}>
                <Icon name={icon} size={22} color={c[tone]} />
              </View>)}
              <View style={{ flex: 1 }}>
                <T v="headline" style={{ fontFamily: n.readAt ? "Figtree_600SemiBold" : "Figtree_700Bold" }}>{n.title}</T>
                <T v="callout" tone="muted">{n.body}</T>
              </View>
              {!n.readAt && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
