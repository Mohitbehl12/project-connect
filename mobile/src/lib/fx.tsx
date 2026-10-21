import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useReducedMotion } from "react-native-reanimated";

// Experience settings (Settings › Experience): animations, sound, haptics, typing style and chat theme.
// Saved on this phone. Animations also switch off when the phone asks for reduced motion.

export type TypingStyle = "dots" | "hearts" | "playful";
export type ChatThemeId = "default" | "midnight" | "rose" | "passion" | "luxury" | "romance" | "starlight";
export type FxPrefs = { animations: boolean; sound: boolean; haptics: boolean; typing: TypingStyle; chatTheme: ChatThemeId };
const DEFAULTS: FxPrefs = { animations: true, sound: true, haptics: true, typing: "hearts", chatTheme: "default" };
const KEY = "kn.fx";

/** Module-level copy so non-React code (haptics, sounds, celebrate) can respect the settings. */
export const fxState = { ...DEFAULTS, reducedMotion: false };

type Ctx = { prefs: FxPrefs; motion: boolean; set: (p: Partial<FxPrefs>) => void };
const FxCtx = createContext<Ctx | null>(null);

export function FxProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [prefs, setPrefs] = useState<FxPrefs>(DEFAULTS);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v) { const p = { ...DEFAULTS, ...JSON.parse(v) }; setPrefs(p); Object.assign(fxState, p); } }).catch(() => {});
  }, []);
  useEffect(() => { fxState.reducedMotion = !!reduced; }, [reduced]);
  const value = useMemo<Ctx>(() => ({
    prefs, motion: prefs.animations && !reduced,
    set: (p) => setPrefs((cur) => { const next = { ...cur, ...p }; Object.assign(fxState, next); AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {}); return next; }),
  }), [prefs, reduced]);
  return <FxCtx.Provider value={value}>{children}</FxCtx.Provider>;
}

export function useFx() {
  const v = useContext(FxCtx);
  return v ?? { prefs: DEFAULTS, motion: true, set: () => {} };
}

// ---- sounds (short, synthesised in-house; quiet and only for key moments) --------------------------
const SOURCES = {
  heartbeat: require("../../assets/sounds/heartbeat.wav"),
  match: require("../../assets/sounds/match.wav"),
  wink: require("../../assets/sounds/wink.wav"),
  sparkle: require("../../assets/sounds/sparkle.wav"),
  soft: require("../../assets/sounds/soft.wav"),
} as const;
export type SoundName = keyof typeof SOURCES;
const players: Partial<Record<SoundName, AudioPlayer>> = {};

export function playSound(name: SoundName) {
  if (!fxState.sound) return;
  try {
    const p = players[name] ?? (players[name] = createAudioPlayer(SOURCES[name]));
    p.volume = 0.5;
    (p.seekTo(0) as unknown as Promise<void> | undefined)?.catch?.(() => {});
    // Browsers block sound until the person has interacted with the page; that's fine — skip quietly.
    (p.play() as unknown as Promise<void> | undefined)?.catch?.(() => {});
  } catch { /* sound is a nice-to-have */ }
}

// ---- celebrations: a full-screen moment drawn by <FxLayer/> -------------------------------------------
export type Celebration = { seq: string[]; burst?: string[]; sound?: SoundName; caption?: string };
type Listener = (c: Celebration) => void;
const listeners = new Set<Listener>();
export function onCelebrate(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Plays a moment: e.g. ⭐ → ✨ → ❤️ → 🔥 then a burst of particles. Sound and animation follow the settings. */
export function celebrate(c: Celebration) {
  if (c.sound) playSound(c.sound);
  if (!fxState.animations || fxState.reducedMotion) return;
  listeners.forEach((l) => l(c));
}

export const MOMENTS = {
  like: { seq: ["❤️", "💖", "💕", "✨"], burst: ["❤️", "💕", "💖", "❤️", "✨", "💕"], sound: "heartbeat" },
  superLike: { seq: ["⭐", "✨", "❤️", "🔥"], burst: ["⭐", "✨", "💙", "❤️", "✨", "⭐"], sound: "sparkle" },
  spark: { seq: ["✨", "💕", "🔥"], burst: ["✨", "✨", "💫", "🔥", "✨"], sound: "sparkle" },
  wink: { seq: ["😉", "💕", "✨"], burst: ["😉", "💕", "✨"], sound: "wink" },
  heart: { seq: ["❤️"], burst: ["❤️", "❤️", "💕", "💖", "✨", "❤️", "✨"], sound: "heartbeat" },
  callYes: { seq: ["📞", "❤️"], burst: ["💕", "✨", "❤️"], sound: "soft", caption: "It's a yes! Time to talk. 💕📞" },
} satisfies Record<string, Celebration>;
