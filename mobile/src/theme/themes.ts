// Colour themes people can choose in Settings › Colour theme. Each theme is defined by a few seed
// colours; the full light and dark palettes are derived from them so every theme stays consistent.
// scripts/check-themes.ts verifies text contrast (WCAG AA, 4.5:1) for every theme in both modes.
// Pure TypeScript (no React Native imports) so it can be checked from Node.

export type Palette = {
  bg: string; surface: string; raised: string; line: string;
  text: string; muted: string; faint: string;
  brand: string; brandText: string; brandWash: string;
  accent: string; accentText: string; accentWash: string;
  trust: string; trustWash: string; alert: string; alertWash: string;
  scrim: string; overlay: string; tab: string;
};

/** Theme-specific colours beyond the palette: gradients and the dark "night" screens (welcome, match). */
export type Glow = {
  dusk: readonly [string, string]; // premium surfaces
  sunset: readonly [string, string, string]; // the Like button and match celebration
  aurora: { light: readonly [string, string, string]; dark: readonly [string, string, string] };
  night: string; // background of immersive dark screens
  nightRaised: string; // cards on those screens
  onNight: string; // soft text on night
  spark: string; // bright highlight on night (and photos)
  spark2: string; // second highlight
};

export type Theme = { id: string; name: string; swatch: readonly string[]; light: Palette; dark: Palette; g: Glow };

type Seed = {
  id: string; name: string;
  brand: string; // buttons and links in light mode (white text on it)
  brandDark: string; // brand in dark mode (dark text on it)
  accent: string; accentInk: string; // highlight chips and the text on them
  bg: string; text: string; // light-mode page and body text
  grad: readonly [string, string]; // vivid pair for gradients
  night: string; // dark-mode page
};

// ---- colour maths -----------------------------------------------------------------------------
const hex = (h: string) => { const s = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const toHex = (rgb: number[]) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
/** Mix b into a by t (0 = a, 1 = b). */
export const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
export const alpha = (h: string, a: number) => `rgba(${hex(h).join(",")},${a})`;
const lum = (h: string) => { const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = hex(h).map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function build(s: Seed): Theme {
  const W = "#FFFFFF";
  const light: Palette = {
    bg: s.bg, surface: W, raised: mix(s.bg, s.brand, 0.07), line: mix(s.bg, s.brand, 0.15),
    text: s.text, muted: mix(s.text, s.bg, 0.3), faint: mix(s.text, s.bg, 0.5),
    brand: s.brand, brandText: W, brandWash: mix(W, s.brand, 0.12),
    accent: s.accent, accentText: s.accentInk, accentWash: mix(W, s.accent, 0.3),
    trust: "#1F7A6B", trustWash: "#DCF0EA", alert: "#B3261E", alertWash: "#FCE4E2",
    scrim: alpha(s.night, 0.88), overlay: alpha(s.night, 0.45), tab: "rgba(255,255,255,0.94)",
  };
  const dText = mix(W, s.brandDark, 0.06);
  const dSurface = mix(s.night, s.brandDark, 0.08);
  const dark: Palette = {
    bg: s.night, surface: dSurface, raised: mix(s.night, s.brandDark, 0.14), line: mix(s.night, s.brandDark, 0.22),
    text: dText, muted: mix(dText, s.night, 0.25), faint: mix(dText, s.night, 0.45),
    brand: s.brandDark, brandText: s.night, brandWash: mix(s.night, s.brandDark, 0.22),
    accent: mix(s.accent, W, 0.1), accentText: s.night, accentWash: mix(s.night, s.accent, 0.2),
    trust: "#73C2A8", trustWash: "#163A30", alert: "#FF7A7A", alertWash: "#45191C",
    scrim: alpha(mix(s.night, "#000000", 0.4), 0.9), overlay: "rgba(0,0,0,0.55)", tab: alpha(dSurface, 0.96),
  };
  const g: Glow = {
    dusk: [mix(s.brand, "#000000", 0.18), s.brand],
    sunset: [s.grad[0], mix(s.grad[0], s.grad[1], 0.5), s.grad[1]],
    aurora: {
      light: [alpha(s.grad[0], 0.24), alpha(s.grad[1], 0.26), alpha(s.brandDark, 0.22)],
      dark: [alpha(s.grad[0], 0.36), alpha(s.grad[1], 0.2), alpha(s.brandDark, 0.18)],
    },
    night: s.night, nightRaised: mix(s.night, s.brandDark, 0.12), onNight: mix(W, s.brandDark, 0.3),
    spark: s.accent, spark2: s.brandDark,
  };
  return { id: s.id, name: s.name, swatch: [s.brand, s.accent, s.grad[0], s.grad[1]], light, dark, g };
}

const SEEDS: Seed[] = [
  { id: "lilac-mint", name: "Lilac + mint", brand: "#7B48CC", brandDark: "#C3A6FF", accent: "#7FD8BE", accentInk: "#173B33", bg: "#F7F4FF", text: "#2B1F45", grad: ["#8E5BD8", "#7FD8BE"], night: "#16112A" },
  { id: "lavender-peach", name: "Lavender + peach", brand: "#7446D4", brandDark: "#C9B3FF", accent: "#FFC4A3", accentInk: "#4A2A14", bg: "#FAF6FF", text: "#2E2142", grad: ["#9B7BEA", "#FFB38A"], night: "#18122B" },
  { id: "pink-lavender", name: "Baby pink + lavender", brand: "#7E4FD0", brandDark: "#D5B8FF", accent: "#F9C9DC", accentInk: "#5A2440", bg: "#FFF8FB", text: "#3A2340", grad: ["#F4A9CC", "#A98BEA"], night: "#1C1222" },
  { id: "teal-coral", name: "Teal + coral", brand: "#0F7377", brandDark: "#6FD3D3", accent: "#FFC2AE", accentInk: "#5A2414", bg: "#F2FAFA", text: "#14363A", grad: ["#2BA8A8", "#FF9E80"], night: "#0D1F21" },
  { id: "sky-lilac", name: "Sky blue + lilac", brand: "#2F62C8", brandDark: "#9CC2FF", accent: "#D9CCFF", accentInk: "#2B1F55", bg: "#F4F8FF", text: "#1C2A48", grad: ["#7FB3FF", "#B9A3FA"], night: "#0F172B" },
  { id: "sage-cream", name: "Sage green + cream", brand: "#47755A", brandDark: "#A9D3B4", accent: "#EBDDB8", accentInk: "#4A3A14", bg: "#F8F6EE", text: "#26332B", grad: ["#8FB89A", "#E6C98F"], night: "#121A15" },
  { id: "plum-gold", name: "Plum + gold", brand: "#6B2E7E", brandDark: "#D9A8E8", accent: "#F2CF7A", accentInk: "#4A3410", bg: "#FBF7FB", text: "#2A1830", grad: ["#8E4A9E", "#F2C35E"], night: "#1A0F1E" },
  { id: "peach-mint", name: "Peach + mint", brand: "#A94B25", brandDark: "#FFB38A", accent: "#BDEBDD", accentInk: "#173B33", bg: "#FFF8F3", text: "#3A2418", grad: ["#FFB38A", "#7FD8BE"], night: "#1E1410" },
  { id: "ocean-sand", name: "Ocean blue + sand", brand: "#1E5F8E", brandDark: "#8EC5EE", accent: "#F2D7A0", accentInk: "#4A3410", bg: "#F5F8FA", text: "#172A3A", grad: ["#3A8FC7", "#F2C98A"], night: "#0E1A24" },
  { id: "indigo-marigold", name: "Indigo + marigold", brand: "#2E2A6E", brandDark: "#9C96F4", accent: "#F2A93B", accentInk: "#1C1B3A", bg: "#F7F6FB", text: "#1C1B3A", grad: ["#6C5CE7", "#F7B54C"], night: "#12112A" },
];

export const THEMES: Theme[] = SEEDS.map(build);
export const DEFAULT_THEME = "lilac-mint";
export const themeById = (id: string | null | undefined) => THEMES.find((t) => t.id === id) ?? THEMES[0];
