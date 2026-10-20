import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";

// Kinara icon set: 24 pt grid, 1.75 pt rounded strokes. Brand-specific glyphs (discover,
// matches, verified) are built from the Arc; the rest are plain, original line drawings.
const P: Record<string, string[]> = {
  discover: ["M5.6 18.4A9 9 0 0 1 5.6 5.6", "M18.4 5.6a9 9 0 0 1 0 12.8", "M12 8.5l1.6 3.5-1.6 3.5-1.6-3.5z"],
  likes: ["M12 19.5s-7-4.2-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.4-7 9.6-7 9.6z"],
  matches: ["M9.5 4.6a8 8 0 0 0 0 14.8", "M14.5 4.6a8 8 0 0 1 0 14.8", "M9 12h6"],
  messages: ["M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3.5v-3.5H6.5a2 2 0 0 1-2-2z"],
  profile: ["M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5"],
  shield: ["M12 3.5l7 2.8v5.4c0 4.3-3 7.4-7 8.8-4-1.4-7-4.5-7-8.8V6.3z", "M9.2 12l2 2 3.8-4"],
  check: ["M5 12.5l4.2 4.2L19 7"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  back: ["M15 5l-7 7 7 7"],
  forward: ["M9 5l7 7-7 7"],
  more: [],
  star: ["M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"],
  pass: ["M7 7l10 10", "M17 7L7 17"],
  undo: ["M9 7L5 11l4 4", "M5 11h9a5 5 0 0 1 0 10h-2"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  camera: ["M4.5 8.5a2 2 0 0 1 2-2h1.8l1.4-2h4.6l1.4 2h1.8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z", "M12 16a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"],
  image: ["M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z", "M4.5 16l4.5-4.5 4 4 2.5-2.5 4 4", "M15 9.5h.01"],
  mic: ["M12 4a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0v-5A2.5 2.5 0 0 1 12 4z", "M6.5 11.5a5.5 5.5 0 0 0 11 0", "M12 17v3"],
  calendar: ["M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z", "M5 10h14", "M9 3.5v3", "M15 3.5v3"],
  bell: ["M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z", "M10 20.5h4"],
  sliders: ["M5 7h9", "M18 7h1", "M16 5v4", "M5 17h3", "M12 17h7", "M10 15v4"],
  settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.1 1.2L10 21h4l.5-2.6a7 7 0 0 0 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"],
  send: ["M5 12l14-7-5 14-2.5-5.5z", "M11.5 13.5L19 5"],
  pin: ["M12 20.5s6-5.4 6-10.3a6 6 0 0 0-12 0c0 4.9 6 10.3 6 10.3z", "M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  flag: ["M6 20.5V4.5", "M6 5h10l-1.5 3.5L16 12H6"],
  block: ["M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M6.4 6.4l11.2 11.2"],
  sparkle: ["M12 4l1.6 4.6L18 10l-4.4 1.4L12 16l-1.6-4.6L6 10l4.4-1.4z", "M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"],
  lock: ["M7 11V8.5a5 5 0 0 1 10 0V11", "M5.5 11h13v9h-13z"],
  eye: ["M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  moon: ["M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"],
  logout: ["M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4", "M10 16l4-4-4-4", "M14 12H4.5"],
  trash: ["M5 7h14", "M9 7V4.5h6V7", "M7 7l1 13h8l1-13"],
  edit: ["M5 19l1-4 10-10 3 3-10 10z", "M14 7l3 3"],
  explore: ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z", "M15.5 8.5l-2 5-5 2 2-5z"],
  gift: ["M4.5 10h15v3h-15z", "M6 13v7h12v-7", "M12 10v10", "M12 10c-1.5-3.5-5.5-4-5.5-1.5S10 10 12 10z", "M12 10c1.5-3.5 5.5-4 5.5-1.5S14 10 12 10z"],
  card: ["M3.5 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z", "M3.5 10h17", "M7 15h3"],
  receipt: ["M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z", "M9 8h6", "M9 11.5h6", "M9 15h3"],
  download: ["M12 4v11", "M7.5 10.5L12 15l4.5-4.5", "M5 19.5h14"],
  key: ["M14.5 9.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0z", "M13.5 12.5L20 19l-1.5 1.5", "M17 16l1.5-1.5"],
  copy: ["M9 9h10v10H9z", "M5 15V5h10"],
  share: ["M12 15V4", "M8 8l4-4 4 4", "M6 12v7.5h12V12"],
  phone: ["M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5z", "M11 17.5h2"],
  call: ["M6.5 4.5h2.8l1.4 3.6-1.9 1.3a9.5 9.5 0 0 0 5.8 5.8l1.3-1.9 3.6 1.4v2.8a1.5 1.5 0 0 1-1.6 1.5C10.8 18.5 5.5 13.2 5 6.1a1.5 1.5 0 0 1 1.5-1.6z"],
  hangup: ["M3.5 13.5c4.6-4.4 12.4-4.4 17 0l-1.6 2.6-3.3-1.2v-2.3a10 10 0 0 0-7.2 0v2.3l-3.3 1.2z"],
  video: ["M4 7.5a1.5 1.5 0 0 1 1.5-1.5h8.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 16.5z", "M15.5 10.5l4.5-2.5v8l-4.5-2.5"],
  videoOff: ["M4 7.5a1.5 1.5 0 0 1 1.5-1.5h8.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 16.5z", "M15.5 10.5l4.5-2.5v8l-4.5-2.5", "M3.5 3.5l17 17"],
  micOff: ["M12 4a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0v-5A2.5 2.5 0 0 1 12 4z", "M6.5 11.5a5.5 5.5 0 0 0 11 0", "M12 17v3", "M4.5 4.5l15 15"],
  volume: ["M4.5 9.5h3l4.5-4v13l-4.5-4h-3z", "M15.5 9a4 4 0 0 1 0 6", "M18 6.5a7.5 7.5 0 0 1 0 11"],
  flip: ["M4.5 9a8 8 0 0 1 14.2-3", "M19 3.5V7h-3.5", "M19.5 15a8 8 0 0 1-14.2 3", "M5 20.5V17h3.5"],
  tag: ["M4 12.5V5a1 1 0 0 1 1-1h7.5l7.5 7.5-8 8z", "M8.5 8.5h.01"],
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 24, color, filled, stroke = 1.75 }: { name: IconName; size?: number; color?: string; filled?: boolean; stroke?: number }) {
  const { c } = useTheme();
  const col = color ?? c.text;
  if (name === "more")
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="6" cy="12" r="1.6" fill={col} /><Circle cx="12" cy="12" r="1.6" fill={col} /><Circle cx="18" cy="12" r="1.6" fill={col} />
      </Svg>
    );
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {P[name].map((d, i) => (
        <Path key={i} d={d} stroke={col} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
          fill={filled && i === 0 && !["discover", "matches"].includes(name) ? col : "none"} />
      ))}
    </Svg>
  );
}

/** Verified badge: a closed sage ring with a check — distinct from platform checkmarks. */
export function VerifiedBadge({ size = 18 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Verified">
      <Circle cx="12" cy="12" r="10" fill={c.trust} />
      <Circle cx="12" cy="12" r="7.2" fill="none" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1.4} />
      <Path d="M8.2 12.3l2.5 2.5 5.1-5.3" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
