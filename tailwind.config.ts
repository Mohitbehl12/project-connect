import type { Config } from "tailwindcss";

// Project Connect design tokens — original palette, not derived from any existing dating brand.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Calm and fresh: lilac brand, mint accent, deep-violet text. AA contrast checked.
        ink: { DEFAULT: "#2B1F45", soft: "#625680", faint: "#8A80A6" },
        paper: { DEFAULT: "#F7F4FF", raised: "#FFFFFF", sunk: "#EEE8FF" },
        mist: "#E2DAF5",
        berry: { DEFAULT: "#7B48CC", deep: "#5E33A8", wash: "#EEE6FF" }, // brand (lilac)
        marigold: { DEFAULT: "#7FD8BE", deep: "#2E9E7E", wash: "#DDF5EC" }, // mint accent (name kept so classes still work)
        rose: { DEFAULT: "#B3261E", wash: "#FCE4E2" }, // errors only
        sage: { DEFAULT: "#1F7A6B", wash: "#DCF0EA" },
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "system-ui", "sans-serif"],
        body: ["Figtree", "system-ui", "sans-serif"],
      },
      borderRadius: { card: "22px", pill: "999px" },
    },
  },
  plugins: [],
} satisfies Config;
