import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { defaultSpec, normalize } from "@shared/style/darzi.js";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { GarmentView } from "./GarmentView";
import { STYLE_ACCENT } from "./StyleHeader";
import { useTheme } from "@/theme/ThemeProvider";

const SHOWCASE = normalize({ ...defaultSpec("kurta"), color: "Mint", fabric: "Mul cotton", pattern: "Chikankari", collar: "Round" });

/** The door from dating into Kinara Style (custom clothing). Clearly a different place. */
export function StyleEntryCard() {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open Kinara Style: clothes made to your measurements" onPress={() => router.push("/style")}
      style={{ marginHorizontal: 20, borderRadius: 22, backgroundColor: c.surface, borderWidth: 2, borderColor: STYLE_ACCENT, flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
      <GarmentView spec={SHOWCASE} size={64} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="caption" strong style={{ color: STYLE_ACCENT, letterSpacing: 0.6 }}>KINARA STYLE</T>
        <T v="headline">Clothes made for you</T>
        <T v="caption" tone="muted">Design an outfit, add your measurements, we tailor and deliver it.</T>
      </View>
      <Icon name="forward" color={STYLE_ACCENT} />
    </Pressable>
  );
}
