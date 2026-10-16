// Project Connect design tokens. Colours come from the chosen colour theme (see ./themes.ts):
// read them with useTheme() — `c` for the palette and `g` for gradients. The exports below are the
// default theme, for the few places that run outside React.
import { DEFAULT_THEME, themeById } from "./themes";

export type { Palette } from "./themes";
const base = themeById(DEFAULT_THEME);
export const palettes = { light: base.light, dark: base.dark } as const;
export const dusk = base.g.dusk;
export const sunset = base.g.sunset;
export const aurora = base.g.aurora;

export const fonts = {
  display: "BricolageGrotesque_800ExtraBold",
  title: "BricolageGrotesque_700Bold",
  body: "Figtree_500Medium",
  bodyStrong: "Figtree_700Bold",
  label: "Figtree_600SemiBold",
} as const;

/** Type scale in points: [size, lineHeight]. */
export const type = {
  display: [34, 38],
  title: [26, 30],
  headline: [19, 24],
  body: [17, 24],
  callout: [15, 20],
  caption: [13, 17],
} as const;

export const space = (n: number) => n * 4;
export const radius = { card: 28, sheet: 24, input: 16, chip: 999, button: 999 } as const;
export const touch = 48;

export const motion = {
  tap: 120,
  quick: 180,
  standard: 260,
  spring: { damping: 18, stiffness: 180 },
} as const;
