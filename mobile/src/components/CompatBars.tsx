import { View } from "react-native";
import type { Compatibility } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";
import { T } from "./Text";

/** Per-factor compatibility bars, each rounded to the nearest 5% by the server. */
export function Bars({ data, limit }: { data: Compatibility; limit?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {data.bars.slice(0, limit).map((b) => (
        <View key={b.key} style={{ gap: 6 }} accessible accessibilityLabel={`${b.label}, ${b.value} percent`}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T v="callout">{b.label}</T>
            <T v="callout" tone="muted">{b.value}%</T>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.raised, overflow: "hidden" }}>
            <View style={{ width: `${b.value}%`, height: 8, borderRadius: 4, backgroundColor: b.value >= 75 ? c.trust : b.value >= 55 ? c.accent : c.faint }} />
          </View>
        </View>
      ))}
    </View>
  );
}

