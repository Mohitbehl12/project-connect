import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { api } from "@/lib/api";
import { useFx, type ChatThemeId, type TypingStyle } from "@/lib/fx";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Burst } from "./FxLayer";
import { T } from "./Text";

// ---- chat themes ------------------------------------------------------------------------------------
export const CHAT_THEMES: { id: ChatThemeId; name: string; colors: readonly [string, string, ...string[]]; dots?: string; float?: string[] }[] = [
  { id: "default", name: "Kinara", colors: ["transparent", "transparent"] },
  { id: "midnight", name: "Midnight 🌙", colors: ["#05050A", "#0E0B19"], dots: "#FFFFFF" },
  { id: "rose", name: "Rose 🌹", colors: ["#2A0714", "#5E1430", "#8E2A4E"] },
  { id: "passion", name: "Passion 🔥", colors: ["#0B0204", "#2A0509", "#140304"], float: ["🔥", "✨"] },
  { id: "luxury", name: "Luxury ✨", colors: ["#0A0806", "#1C150B", "#0A0806"], dots: "#E9C37A" },
  { id: "romance", name: "Romance 💕", colors: ["#1E0A14", "#3A1226", "#5A1C3A"], float: ["💕", "❤️"] },
  { id: "starlight", name: "Starlight ⭐", colors: ["#050B1F", "#0C1A3D", "#13234D"], dots: "#CFE0FF" },
];
export const chatTheme = (id: ChatThemeId) => CHAT_THEMES.find((t) => t.id === id) ?? CHAT_THEMES[0];

function Star({ x, y, color, delay, motion }: { x: number; y: number; color: string; delay: number; motion: boolean }) {
  const o = useSharedValue(0.5);
  useEffect(() => { if (motion) o.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 1400 }), withTiming(0.25, { duration: 1600 })), -1)); }, [motion, delay, o]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ position: "absolute", left: `${x}%`, top: `${y}%`, width: 2.5, height: 2.5, borderRadius: 2, backgroundColor: color }, s]} />;
}

function Floater({ emoji, x, delay }: { emoji: string; x: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1)); }, [delay, t]);
  const s = useAnimatedStyle(() => ({ opacity: 0.18 * Math.sin(Math.PI * t.value), transform: [{ translateY: 600 - 700 * t.value }, { translateX: 14 * Math.sin(t.value * 8) }] }));
  return <Animated.Text style={[{ position: "absolute", left: `${x}%`, fontSize: 18 }, s]} accessibilityElementsHidden>{emoji}</Animated.Text>;
}

/** The chat background for the chosen theme. Ambient motion is slow and faint, and off with animations off. */
export function ChatBackdrop({ id }: { id: ChatThemeId }) {
  const { motion } = useFx();
  const t = chatTheme(id);
  const stars = useMemo(() => Array.from({ length: 34 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 53) % 100, d: (i * 211) % 3000 })), []);
  if (id === "default") return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={t.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {t.dots && stars.map((s, i) => <Star key={i} x={s.x} y={s.y} color={t.dots!} delay={s.d} motion={motion} />)}
      {t.float && motion && [12, 38, 64, 86].map((x, i) => <Floater key={i} emoji={t.float![i % t.float!.length]} x={x} delay={i * 3500} />)}
    </View>
  );
}

// ---- winks and hearts in the chat --------------------------------------------------------------------
/** A wink 😉 or heart ❤️ message: big emoji that pops in (and bursts) when it has just arrived. */
export function FlirtBubble({ kind, fresh }: { kind: string; fresh: boolean }) {
  const { motion } = useFx();
  const play = fresh && motion;
  const scale = useSharedValue(play ? 2.4 : 1);
  const blink = useSharedValue(1);
  useEffect(() => {
    if (!play) return;
    scale.value = withSequence(withTiming(2.6, { duration: 180 }), withDelay(kind === "WINK" ? 380 : 120, withSpring(1, { damping: 9 })));
    if (kind === "HEART") blink.value = withDelay(500, withRepeat(withSequence(withTiming(1.18, { duration: 160 }), withTiming(1, { duration: 160 })), 2));
  }, [play, kind, scale, blink]);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: scale.value * blink.value }] }));
  const [eye, setEye] = useState(kind === "WINK" && play ? "😊" : null);
  useEffect(() => { if (!eye) return; const h = setTimeout(() => setEye(null), 260); return () => clearTimeout(h); }, [eye]);
  return (
    <View style={{ padding: 4, alignItems: "center", justifyContent: "center" }}>
      <Animated.Text style={[{ fontSize: 46 }, s]} accessibilityLabel={kind === "WINK" ? "A wink" : "A heart"}>{eye ?? (kind === "WINK" ? "😉" : "❤️")}</Animated.Text>
      {play && <Burst emojis={kind === "WINK" ? ["💕", "✨", "💕"] : ["❤️", "💕", "💖", "✨", "❤️"]} size={18} rise={90} />}
    </View>
  );
}

// ---- typing --------------------------------------------------------------------------------------------
function Dot({ i, color }: { i: number; color: string }) {
  const y = useSharedValue(0);
  useEffect(() => { y.value = withDelay(i * 140, withRepeat(withSequence(withTiming(-3, { duration: 260 }), withTiming(0, { duration: 260 })), -1)); }, [i, y]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.Text style={[{ color, fontSize: 18, lineHeight: 18 }, s]}>•</Animated.Text>;
}

export function TypingBubble({ name, style }: { name: string; style: TypingStyle }) {
  const { c } = useTheme();
  return (
    <Animated.View entering={FadeIn} accessibilityLiveRegion="polite" accessibilityLabel={`${name} is typing`}
      style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: c.surface, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginTop: 4 }}>
      {style === "playful" ? <T v="caption" tone="muted">{name} is thinking about what to say… 😉</T> : (
        <>
          {style === "hearts" && <T v="caption">💕 </T>}
          {[0, 1, 2].map((i) => <Dot key={i} i={i} color={c.muted} />)}
        </>
      )}
    </Animated.View>
  );
}

// ---- reactions ---------------------------------------------------------------------------------------------
export const REACTIONS = [["❤️", "Like"], ["😉", "Wink"], ["🔥", "Chemistry"], ["😍", "Love"], ["✨", "Wow"]] as const;

export function ReactionBar({ current, onPick }: { current: string | null; onPick: (e: string | null) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: c.raised, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
      {REACTIONS.map(([e, label]) => (
        <Pressable key={e} accessibilityRole="button" accessibilityLabel={current === e ? `Remove ${label}` : label} onPress={() => { haptic.tick(); onPick(current === e ? null : e); }}
          style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: current === e ? c.brandWash : "transparent" }}>
          <T style={{ fontSize: 28 }}>{e}</T>
        </Pressable>
      ))}
    </View>
  );
}

// ---- Cupid ---------------------------------------------------------------------------------------------------
type Idea = { text: string; why: string };

/** Cupid ❤️ suggestions: tap one to put it in the message box. Nothing is sent for you. */
export function CupidPanel({ matchId, firstName, onPick }: { matchId: string; firstName: string; onPick: (t: string) => void }) {
  const { c } = useTheme();
  const [task, setTask] = useState<"opener" | "reply" | "date">("opener");
  const [seed, setSeed] = useState(0);
  const [data, setData] = useState<{ ideas: Idea[]; note: string } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setData(null); setErr("");
    api<{ ideas: Idea[]; note: string }>("/api/cupid", { body: { task, matchId, seed } }).then(setData).catch((e) => setErr(e.message));
  }, [task, seed, matchId]);
  const tabs = [["opener", "Break the ice"], ["reply", "Reply ideas"], ["date", "Date ideas"]] as const;
  return (
    <View style={{ gap: 10 }}>
      <T tone="muted">Want me to help you with {firstName}? 😉</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {tabs.map(([k, l]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: task === k }} onPress={() => setTask(k)}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: task === k ? c.brand : c.raised }}>
            <T v="callout" strong style={{ color: task === k ? c.brandText : c.text }}>{l}</T>
          </Pressable>
        ))}
      </ScrollView>
      {err ? <T tone="alert">{err}</T> : !data ? <T tone="faint">Thinking…</T> : data.ideas.map((i) => (
        <Pressable key={i.text} accessibilityRole="button" accessibilityLabel={`Use: ${i.text}`} onPress={() => { haptic.tick(); onPick(i.text); }}
          style={{ backgroundColor: c.raised, borderRadius: 16, padding: 12, gap: 2 }}>
          <T v="callout">{i.text}</T>
          <T v="caption" tone="faint">{i.why}</T>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={() => setSeed((s) => s + 1)} style={{ alignSelf: "center", padding: 8 }}><T v="callout" tone="brand" strong>More ideas ✨</T></Pressable>
      <T v="caption" tone="faint">{data?.note ?? "Cupid's ideas are automatic suggestions from your profiles."}</T>
    </View>
  );
}
