// Project Connect design tokens. One brand idea — the Arc — and a restrained palette:
// indigo is the brand, marigold is an accent only, sage means trust, rose means alert.

export const palettes = {
  light: {
    bg: "#F7F6FB",
    surface: "#FFFFFF",
    raised: "#EEECF7",
    line: "#E2DFF0",
    text: "#1C1B3A",
    muted: "#5D5B82",
    faint: "#8C8AAE",
    brand: "#2E2A6E",
    brandText: "#FFFFFF",
    accent: "#F2A93B",
    accentText: "#1C1B3A",
    accentWash: "#FDF0DA",
    trust: "#3F7563",
    trustWash: "#E1EEE8",
    alert: "#C8406A",
    alertWash: "#F8E3EA",
    scrim: "rgba(18,17,42,0.88)",
    overlay: "rgba(18,17,42,0.45)",
    tab: "rgba(255,255,255,0.94)",
  },
  dark: {
    bg: "#12112A",
    surface: "#1D1C3A",
    raised: "#28274A",
    line: "#33325A",
    text: "#F2F0FA",
    muted: "#A8A6C8",
    faint: "#7C7AA0",
    brand: "#8F88F0",
    brandText: "#12112A",
    accent: "#F5B656",
    accentText: "#12112A",
    accentWash: "#3A2F1E",
    trust: "#6FAF97",
    trustWash: "#1D3A31",
    alert: "#E7698C",
    alertWash: "#3D1C29",
    scrim: "rgba(10,9,26,0.9)",
    overlay: "rgba(0,0,0,0.55)",
    tab: "rgba(29,28,58,0.96)",
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)["light"]]: string };

/** The one gradient in the system — reserved for Premium. */
export const dusk = ["#2E2A6E", "#6C5CE7"] as const;

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
