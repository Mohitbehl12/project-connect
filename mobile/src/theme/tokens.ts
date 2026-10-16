// Project Connect design tokens. Calm and fresh: lilac is the brand, mint is the accent,
// a deeper teal means trust, and red is kept only for errors. Text pairs meet WCAG AA (4.5:1+).

export const palettes = {
  light: {
    bg: "#F7F4FF",
    surface: "#FFFFFF",
    raised: "#EEE8FF",
    line: "#E2DAF5",
    text: "#2B1F45",
    muted: "#625680",
    faint: "#8A80A6",
    brand: "#7B48CC",
    brandText: "#FFFFFF",
    brandWash: "#EEE6FF",
    accent: "#7FD8BE",
    accentText: "#173B33",
    accentWash: "#DDF5EC",
    trust: "#1F7A6B",
    trustWash: "#DCF0EA",
    alert: "#B3261E",
    alertWash: "#FCE4E2",
    scrim: "rgba(22,17,42,0.88)",
    overlay: "rgba(22,17,42,0.45)",
    tab: "rgba(255,255,255,0.94)",
  },
  dark: {
    bg: "#16112A",
    surface: "#211A3A",
    raised: "#2D2450",
    line: "#3A3060",
    text: "#F3EFFF",
    muted: "#B9AED6",
    faint: "#8F84AE",
    brand: "#C3A6FF",
    brandText: "#16112A",
    brandWash: "#33285A",
    accent: "#8EE3C8",
    accentText: "#16112A",
    accentWash: "#18392F",
    trust: "#73C2A8",
    trustWash: "#163A30",
    alert: "#FF7A7A",
    alertWash: "#45191C",
    scrim: "rgba(10,8,22,0.9)",
    overlay: "rgba(0,0,0,0.55)",
    tab: "rgba(33,26,58,0.96)",
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)["light"]]: string };

/** Premium surfaces: deep lilac into lilac. */
export const dusk = ["#5E33A8", "#8E5BD8"] as const;
/** Fresh action gradient — the Like button and match celebration only: mint into lilac. */
export const sunset = ["#7FD8BE", "#A98BEA", "#8E5BD8"] as const;
/** Ambient light behind screens: three soft colour fields per theme. */
export const aurora = {
  light: ["rgba(142,91,216,0.24)", "rgba(127,216,190,0.26)", "rgba(195,166,255,0.22)"],
  dark: ["rgba(142,91,216,0.38)", "rgba(127,216,190,0.18)", "rgba(195,166,255,0.20)"],
} as const;

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
