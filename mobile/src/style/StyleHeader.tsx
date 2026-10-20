import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { ArcMark } from "@/components/Arc";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { useTheme } from "@/theme/ThemeProvider";

/** Kinara Style keeps its own warm accent and this header, so it never feels mixed up with dating. */
export const STYLE_ACCENT = "#B8761B";

export function StyleHeader({ title, sub, back }: { title: string; sub?: string; back?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6, paddingBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={10} style={{ paddingRight: 4 }}><Icon name="back" /></Pressable>
        ) : <ArcMark size={22} />}
        <T v="caption" strong style={{ color: STYLE_ACCENT, letterSpacing: 0.6 }}>KINARA STYLE</T>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Switch to dating" onPress={() => router.replace("/(tabs)/discover")}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Icon name="likes" size={16} color={c.brand} /><T v="caption" strong>Dating</T>
        </Pressable>
      </View>
      <T v="title">{title}</T>
      {sub ? <T v="callout" tone="muted">{sub}</T> : null}
    </View>
  );
}
