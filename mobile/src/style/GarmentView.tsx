import { useMemo } from "react";
import { View, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import { garmentSVG, type Spec } from "@shared/style/darzi.js";
import { useTheme } from "@/theme/ThemeProvider";

/** The virtual preview: the garment drawn on a mannequin, front or back, in the chosen fabric pattern and colour. */
export function GarmentView({ spec, view = "front", size = 220, style }: { spec: Spec; view?: "front" | "back"; size?: number; style?: ViewStyle }) {
  const { c, dark } = useTheme();
  const xml = useMemo(() => {
    const mq = dark ? "#3A3150" : "#E6DEF3";
    return garmentSVG(spec, view)
      .replace(/class="mq"/g, `fill="${mq}" stroke="none"`)
      .replace(/class="mqs"/g, `stroke="${mq}" fill="none"`)
      .replace(/class="[^"]*"/g, "");
  }, [spec, view, dark]);
  return (
    <View accessibilityRole="image" accessibilityLabel={`${view === "front" ? "Front" : "Back"} view`} style={[{ width: size, height: (size * 4) / 3, backgroundColor: c.raised, borderRadius: 18, overflow: "hidden" }, style]}>
      <SvgXml xml={xml} width="100%" height="100%" />
    </View>
  );
}
