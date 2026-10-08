import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, type } from "@/theme/tokens";

type Variant = keyof typeof type;
type Tone = "text" | "muted" | "faint" | "brand" | "accent" | "trust" | "alert" | "brandText" | "accentText" | "white";

const FONT: Record<Variant, string> = {
  display: fonts.display, title: fonts.title, headline: fonts.bodyStrong, body: fonts.body, callout: fonts.label, caption: fonts.body,
};

export function T({ v = "body", tone = "text", center, strong, style, ...rest }: TextProps & { v?: Variant; tone?: Tone; center?: boolean; strong?: boolean }) {
  const { c } = useTheme();
  const [size, line] = type[v];
  const color = tone === "white" ? "#FFFFFF" : c[tone];
  const s: TextStyle = {
    fontFamily: strong ? fonts.bodyStrong : FONT[v],
    fontSize: size,
    lineHeight: line,
    color,
    textAlign: center ? "center" : undefined,
    letterSpacing: v === "display" || v === "title" ? -0.5 : 0,
  };
  // Honour the system text size, capped so layouts stay intact.
  return <RNText maxFontSizeMultiplier={1.6} {...rest} style={[s, style]} />;
}
