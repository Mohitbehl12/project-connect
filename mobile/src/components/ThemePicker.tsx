import { LinearGradient } from "expo-linear-gradient";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { haptic } from "@/lib/haptics";
import { THEMES } from "@/theme/themes";
import { useTheme } from "@/theme/ThemeProvider";

/** Colour theme choices: a small preview of each (gradient, button, highlight). Saved on this phone. */
export function ThemePicker() {
  const { c, dark, themeId, setThemeId } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Colour theme" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingVertical: 12 }}>
      {THEMES.map((t) => {
        const on = t.id === themeId;
        const p = dark ? t.dark : t.light;
        return (
          <Pressable key={t.id} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t.name}
            onPress={() => { haptic.tick(); setThemeId(t.id); }}
            style={{ width: "48%", borderRadius: 18, padding: 8, gap: 8, backgroundColor: p.bg, borderWidth: 2, borderColor: on ? c.brand : c.line }}>
            <LinearGradient colors={[t.g.sunset[0], t.g.sunset[2]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 54, borderRadius: 12, alignItems: "flex-end", padding: 6 }}>
              {on && <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={16} color={p.brand} stroke={2.8} /></View>}
            </LinearGradient>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <View style={{ flex: 1, height: 22, borderRadius: 11, backgroundColor: p.brand }} />
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: p.accent }} />
            </View>
            <T v="caption" strong style={{ color: p.text }} numberOfLines={1}>{t.name}</T>
          </Pressable>
        );
      })}
    </View>
  );
}
