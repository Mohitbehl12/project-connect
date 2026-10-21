import { useEffect, useId } from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useFx } from "@/lib/fx";
import { useTheme } from "@/theme/ThemeProvider";

// Kinara luxury icon set. Original drawings on a 24 pt grid: thin rounded lines (1.5 pt), a soft
// under-stroke for depth, and a rose-to-gold gradient when active. One style for every icon —
// navigation, filters and all interests — so nothing looks borrowed or mismatched.

/** A rounded heart centred at (cx, cy) with radius r. */
const heart = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy + r * 0.95}C${cx - r * 1.45} ${cy + r * 0.05} ${cx - r * 1.05} ${cy - r * 1.05} ${cx} ${cy - r * 0.42}C${cx + r * 1.05} ${cy - r * 1.05} ${cx + r * 1.45} ${cy + r * 0.05} ${cx} ${cy + r * 0.95}Z`;
const sparkle = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}l${r * 0.28} ${r * 0.72} ${r * 0.72} ${r * 0.28}-${r * 0.72} ${r * 0.28}-${r * 0.28} ${r * 0.72}-${r * 0.28}-${r * 0.72}-${r * 0.72}-${r * 0.28} ${r * 0.72}-${r * 0.28}z`;
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 -${r * 2} 0`;
const dot = (x: number, y: number) => `M${x} ${y}h.01`;

export const LUX: Record<string, string[]> = {
  // navigation
  home: ["M4 11.2 12 4.5l8 6.7", "M6 9.8v9.7h12V9.8", "M10.3 19.5v-3.3a1.7 1.7 0 0 1 3.4 0v3.3", heart(12, 11.6, 1.5)],
  explore: [circle(12, 12, 8.3), "M12 6.6l1.25 4.15 4.15 1.25-4.15 1.25L12 17.4l-1.25-4.15L6.6 12l4.15-1.25z", sparkle(19.6, 4.4, 1.6)],
  matches: [heart(9, 12.4, 5.6), heart(15, 11.2, 5.6)],
  messages: ["M4.5 7.2a2.7 2.7 0 0 1 2.7-2.7h9.6a2.7 2.7 0 0 1 2.7 2.7v6.6a2.7 2.7 0 0 1-2.7 2.7h-6.1L6.3 19.8v-3.3h-.1a1.7 1.7 0 0 1-1.7-1.7z", heart(12, 10.7, 2.5)],
  profile: [circle(12, 8, 3.3), "M5.3 19.5c1-3.3 3.6-5.3 6.7-5.3s5.7 2 6.7 5.3"],
  search: [circle(10.8, 10.8, 6.3), "M15.4 15.4l4.6 4.6", sparkle(10.8, 10.8, 2)],
  heart: [heart(12, 12.6, 7.2)],
  spark: [sparkle(12, 12, 8), sparkle(19.5, 5, 1.8)],
  eye: ["M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z", circle(12, 12, 3)],
  flame: ["M12 20.5c-3.6 0-6-2.4-6-5.6 0-3.5 3-5.3 3.4-8.9 2.4 1.3 3.8 3.4 3.8 5.4.8-.6 1.3-1.7 1.4-2.9 2 1.6 3.4 3.9 3.4 6.4 0 3.2-2.4 5.6-6 5.6z", "M12 20.5c-1.4 0-2.4-1-2.4-2.3 0-1.5 1.2-2.2 1.5-3.6 1.4.8 3.3 2 3.3 3.6 0 1.3-1 2.3-2.4 2.3z"],
  star: ["M12 4l2.3 4.9 5.3.6-3.9 3.7 1 5.3L12 15.9l-4.7 2.6 1-5.3-3.9-3.7 5.3-.6z"],
  rose: ["M12 9.8c-2.2 0-3.8-1.6-3.8-3.6 1.3-.4 2.6 0 3.8.9 1.2-.9 2.5-1.3 3.8-.9 0 2-1.6 3.6-3.8 3.6z", "M10.2 4.6c.6-.8 1.1-1.1 1.8-1.1s1.2.3 1.8 1.1", "M12 9.8v10.7", "M12 15.2c-2.5 0-4.1-1.3-4.6-3.1 2.4-.3 3.9.6 4.6 3.1z", "M12 13.6c2.5 0 4.1-1.3 4.6-3.1-2.4-.3-3.9.6-4.6 3.1z"],
  newPeople: [circle(10, 8.5, 3.2), "M4 19.5c.9-3.1 3.2-5 6-5 1.5 0 2.8.5 3.8 1.4", sparkle(18, 15.5, 3.5)],
  // filters
  age: ["M5 7.2A2.2 2.2 0 0 1 7.2 5h9.6A2.2 2.2 0 0 1 19 7.2v10.6a2.2 2.2 0 0 1-2.2 2.2H7.2A2.2 2.2 0 0 1 5 17.8z", "M5 9.8h14", "M9 3.5v3", "M15 3.5v3", heart(12, 14.4, 2)],
  location: ["M12 20.5s6.2-5.5 6.2-10.4a6.2 6.2 0 0 0-12.4 0c0 4.9 6.2 10.4 6.2 10.4z", heart(12, 10.2, 2)],
  interests: [sparkle(10.5, 11.5, 6.5), sparkle(18.5, 5.5, 2.2), sparkle(18.5, 17.5, 1.6)],
  lifestyle: ["M7 4.5h10l3.2 4.6-8.2 10.4L3.8 9.1z", "M3.8 9.1h16.4", "M9.6 4.5 8.3 9.1 12 19.5l3.7-10.4-1.3-4.6"],
  languages: ["M3.5 6.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H9l-3 2.5V12.5h-.5a2 2 0 0 1-2-2z", "M14.5 9h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H18v2.5L15 17h-2.5a2 2 0 0 1-2-2v-.5"],
  education: ["M2.5 9.4 12 5l9.5 4.4L12 13.8z", "M6.5 11.3v4.1c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4.1", "M21.5 9.4v5"],
  profession: ["M4.5 9.2a1.7 1.7 0 0 1 1.7-1.7h11.6a1.7 1.7 0 0 1 1.7 1.7v8.6a1.7 1.7 0 0 1-1.7 1.7H6.2a1.7 1.7 0 0 1-1.7-1.7z", "M9 7.5V6.3a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 6.3v1.2", "M4.5 12.6h15", "M11 12.6v1.4h2v-1.4"],
  relationship: [circle(9.3, 13.3, 4.6), circle(14.7, 13.3, 4.6), sparkle(12, 4.6, 1.8)],
  // interests
  travel: ["M12 3.4c.9 0 1.5.9 1.5 2.1v4.4l7 4v1.8l-7-2v4.3l2 1.6v1.5L12 20.2l-3.5.9v-1.5l2-1.6v-4.3l-7 2v-1.8l7-4V5.5c0-1.2.6-2.1 1.5-2.1z"],
  trekking: ["M2.8 19.5 9.4 8.3l3.9 6.6 2-3 5.9 7.6z", "M9.4 8.3V4.4l3 1.2-3 1.2"],
  cooking: ["M4 11.5h12a6 6 0 0 1-12 0z", "M16 11.5h4.5", "M8 8.5c0-1 1-1 1-2s-1-1-1-2", "M12 8.5c0-1 1-1 1-2s-1-1-1-2"],
  reading: ["M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z", "M12 6.5v13"],
  films: ["M4 10.2h16v9.3H4z", "M4 10.2 5.3 5.8l14.3 3.4-.2 1", "M9.2 6.6l-1.6 3.6", "M14.3 7.8l-1.4 2.4"],
  music_live: ["M9.5 17.5V6.2l9-2v11.3", "M9.5 9.4l9-2", circle(7, 17.5, 2.5), circle(16, 15.5, 2.5)],
  indie_music: ["M4.5 15v-3a7.5 7.5 0 0 1 15 0v3", "M4.5 14.5H7v5H5.5a1 1 0 0 1-1-1z", "M19.5 14.5H17v5h1.5a1 1 0 0 0 1-1z"],
  classical: ["M12 9.5c-2 0-3 1.3-3 2.7 0 .9.6 1.3.6 1.8s-1.1.9-1.1 2.3c0 1.8 1.6 3.2 3.5 3.2s3.5-1.4 3.5-3.2c0-1.4-1.1-1.8-1.1-2.3s.6-.9.6-1.8c0-1.4-1-2.7-3-2.7z", "M12 9.5V3.5", "M10.8 4.5h2.4", "M11 15.5h2"],
  dance: [circle(13.5, 4.2, 1.6), "M7.5 9.3l4.5-1.6 3 2 3.2-1", "M12 7.7l-1 6 3 2.4 1 4.4", "M11 13.7l-3.2 5.8"],
  cricket: ["M15 4l5 5-8.3 8.3-5-5z", "M6.7 12.3 3.5 15.5l5 5 3.2-3.2", circle(18, 18.2, 1.9)],
  football: [circle(12, 12, 8.5), "M12 8.5l3 2.2-1.1 3.6h-3.8L9 10.7z", "M12 8.5V3.5", "M15 10.7l4.6-1.5", "M13.9 14.3l2.8 4", "M10.1 14.3l-2.8 4", "M9 10.7 4.4 9.2"],
  running: ["M3.5 15.5c0-2 1-4.5 2.5-6l2.5 1.5c1 .6 2.4.5 3.2-.3l.8-.7 3 3.3c1.2 1.2 2.8 1.7 4.5 1.7v2.5H3.5z", "M3.5 18h16.5"],
  yoga: ["M12 18.5c-1.8-1.8-2.5-4-2.5-6.5L12 9l2.5 3c0 2.5-.7 4.7-2.5 6.5z", "M12 18.5c-3 0-6-1.5-7.5-4.5 2.5-.5 5 .5 6.5 2", "M12 18.5c3 0 6-1.5 7.5-4.5-2.5-.5-5 .5-6.5 2"],
  gym: ["M8 12h8", "M5.5 8.5v7", "M8 7v10", "M16 7v10", "M18.5 8.5v7", "M3.5 12h2", "M18.5 12h2"],
  photography: ["M4.5 8.5a2 2 0 0 1 2-2h1.8l1.4-2h4.6l1.4 2h1.8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z", circle(12, 13, 3.6), circle(12, 13, 1.4), dot(17, 9.3)],
  art: ["M12 4a8 8 0 0 0 0 16c1.1 0 1.6-.9 1.2-1.8-.5-1 .2-2.2 1.3-2.2H17a3 3 0 0 0 3-3c0-5-3.6-9-8-9z", dot(8, 11), dot(10, 7.5), dot(14.5, 7.5), dot(16.5, 11)],
  theatre: ["M3.5 5c3 1.2 6 1.2 9 0v5.5a4.5 4.5 0 0 1-9 0z", "M11.5 11.2c3 1.2 6 1.2 9 0v5.3a4.5 4.5 0 0 1-9 0", "M6 9h.01M10 9h.01", "M6.5 12.5c1 .8 2 .8 3 0", "M14 15h.01M18 15h.01", "M14.5 18.2c1-.8 2-.8 3 0"],
  standup: ["M12 3.5a2.6 2.6 0 0 1 2.6 2.6v4a2.6 2.6 0 0 1-5.2 0v-4A2.6 2.6 0 0 1 12 3.5z", "M12 12.7v7.3", "M8.5 20h7", "M9.4 7.4h5.2"],
  gaming: ["M7.5 8h9a4 4 0 0 1 3.9 4.9l-.9 3.6a2 2 0 0 1-3.4.9L14.5 15.5h-5l-1.6 1.9a2 2 0 0 1-3.4-.9l-.9-3.6A4 4 0 0 1 7.5 8z", "M8 11v3", "M6.5 12.5h3", dot(15.5, 11.5), dot(17.5, 13)],
  board_games: ["M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z", dot(9, 9), dot(15, 9), dot(12, 12), dot(9, 15), dot(15, 15)],
  coffee: ["M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z", "M16 11h1.5a2.5 2.5 0 0 1 0 5h-2", "M8.5 3.5c0 1.2 1 1.2 1 2.5", "M12 3.5c0 1.2 1 1.2 1 2.5", "M4 21h13"],
  food_trails: [circle(12, 12, 5.5), circle(12, 12, 2.8), "M3.5 4v5a1.5 1.5 0 0 0 3 0V4", "M5 9v11", "M20.5 4c-1.5 1-2 3-2 5v2h2v9"],
  startups: ["M12 3.5c3 2 4.5 5 4.5 8.5L14 15h-4l-2.5-3C7.5 8.5 9 5.5 12 3.5z", circle(12, 9.3, 1.5), "M10 15l-1 4 3-1.5 3 1.5-1-4", "M7.5 12 5 14v3l3-1.5", "M16.5 12l2.5 2v3l-3-1.5"],
  tech: ["M5.5 6.5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1V15h-13z", "M3 18.5h18L19.5 15h-15z"],
  writing: ["M5 19l2-6 8-8.5a2.1 2.1 0 0 1 3 3L9.5 16z", "M14 6l3 3", "M5 19l3-1"],
  poetry: ["M19.5 4.5C13 5 8 9.5 6.5 16.5L5 20", "M19.5 4.5c-1 5-4.5 9-10 11", "M9.5 12.5h4"],
  volunteering: [heart(12, 8.6, 3.2), "M3.5 14.5 7 13.5l4 1.5h3a1.5 1.5 0 0 1 0 3H10", "M14.5 17.5 19 15.5a1.5 1.5 0 0 1 1.5 2.5l-6 3.5H7l-3.5-1.5"],
  dogs: ["M8 6.5 4.5 5 4 10.5l2.5 1.5", "M16 6.5 19.5 5l.5 5.5-2.5 1.5", "M7 9a5 5 0 0 1 10 0v4.5a5 5 0 0 1-10 0z", dot(10, 11), dot(14, 11), "M11 14h2l-1 1z"],
  cats: ["M6 4.5 8.5 8.5h7L18 4.5l.5 9a6.5 6.5 0 0 1-13 0z", dot(9.5, 12.5), dot(14.5, 12.5), "M11 15h2l-1 1z", "M3.5 14h3", "M17.5 14h3"],
  gardening: ["M12 20.5V11", "M12 13c-4 0-6-2.5-6-6 4 0 6 2 6 6z", "M12 11c0-3.5 2-6 6-6 0 3.5-2 6-6 6z", "M8 20.5h8"],
  cycling: [circle(6, 15, 3.5), circle(18, 15, 3.5), "M6 15l4-6.5h5L18 15", "M10 8.5 12.5 15H6", "M14 6h2.5"],
  swimming: ["M3 17c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1", "M3 20.5c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1", circle(17, 8, 1.5), "M6 13l4.5-4 3 2.5L11 14"],
  podcasts: ["M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3z", "M6 11a6 6 0 0 0 12 0", "M12 17v3.5", "M9 20.5h6"],
  fashion: ["M9.5 3.5h5l-1 4 4.5 12.5h-12L10.5 7.5z", "M9.5 3.5c.5 1.5 1.4 2 2.5 2s2-.5 2.5-2", "M8.6 12.5h6.8"],
  spirituality: ["M4 13.5c0 3 3.6 5 8 5s8-2 8-5z", "M12 13.5c-1.5-1.5-1.5-3.5 0-6 1.5 2.5 1.5 4.5 0 6z", "M9 21h6"],
  anime: [circle(12, 12, 2.2), "M12 9.8C10 7.3 10.5 4.2 12 3.6c1.5.6 2 3.7 0 6.2z", "M12 14.2c-2 2.5-1.5 5.6 0 6.2 1.5-.6 2-3.7 0-6.2z", "M9.8 12C7.3 10 4.2 10.5 3.6 12c.6 1.5 3.7 2 6.2 0z", "M14.2 12c2.5-2 5.6-1.5 6.2 0-.6 1.5-3.7 2-6.2 0z"],
  beach: ["M12 4.5a8 8 0 0 1 8 7.5H4a8 8 0 0 1 8-7.5z", "M12 12v6.5", "M10 4.8C9 7 8.7 9.5 9 12", "M14 4.8c1 2.2 1.3 4.7 1 7.2", "M3.5 20.5c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1"],
  nightlife: ["M17.8 14.5A7 7 0 0 1 9.5 5.2a7 7 0 1 0 8.3 9.3z", sparkle(17.5, 6.5, 2.2), sparkle(20.5, 11, 1.2)],
  wine: ["M8 3.5h8l-.5 5a3.5 3.5 0 0 1-7 0z", "M12 12v7", "M8.5 19.5h7", "M8.3 6.5h7.4"],
};

export type LuxName = keyof typeof LUX;
export const hasLux = (k: string) => k in LUX;

/**
 * One luxury icon. `active` switches to the rose→gold gradient with a soft glow; `pop` replays a short
 * spring when it becomes active (200–500 ms, and none with reduced motion or animations off).
 */
export function LuxIcon({ name, size = 24, color, active, stroke = 1.5, pop = true }: { name: string; size?: number; color?: string; active?: boolean; stroke?: number; pop?: boolean }) {
  const { c, g } = useTheme();
  const { motion } = useFx();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const paths = LUX[name] ?? LUX.interests;
  const s = useSharedValue(1);
  useEffect(() => {
    if (active && pop && motion) s.value = withSequence(withTiming(1.16, { duration: 160 }), withSpring(1.08, { damping: 9, stiffness: 180 }));
    else s.value = withTiming(active && pop ? 1.08 : 1, { duration: 200 });
  }, [active, pop, motion, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const ink = active ? `url(#lx${id})` : color ?? c.text;
  return (
    <Animated.View style={[{ width: size, height: size }, anim]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Defs>
          <LinearGradient id={`lx${id}`} gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="21" y2="21">
            <Stop offset="0" stopColor={g.sunset[0]} />
            <Stop offset="0.55" stopColor={g.sunset[1]} />
            <Stop offset="1" stopColor={c.accent} />
          </LinearGradient>
        </Defs>
        {/* soft under-stroke: gives the thin line a little depth */}
        {paths.map((d, i) => <Path key={`u${i}`} d={d} stroke={active ? g.sunset[0] : color ?? c.text} strokeOpacity={active ? 0.28 : 0.1} strokeWidth={stroke + 2.2} strokeLinecap="round" strokeLinejoin="round" />)}
        {paths.map((d, i) => <Path key={i} d={d} stroke={ink} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />)}
      </Svg>
    </Animated.View>
  );
}
