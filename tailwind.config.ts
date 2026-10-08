import type { Config } from "tailwindcss";

// Project Connect design tokens — original palette, not derived from any existing dating brand.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#1C1B3A", soft: "#4A4870", faint: "#8C8AAE" },
        paper: { DEFAULT: "#F6F5FB", raised: "#FFFFFF", sunk: "#ECEAF6" },
        mist: "#DEDBEE",
        marigold: { DEFAULT: "#F2A93B", deep: "#C9821A", wash: "#FDF0DA" },
        rose: { DEFAULT: "#C8406A", wash: "#F8E3EA" },
        sage: { DEFAULT: "#4F8270", wash: "#E1EEE8" },
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
