import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { palettes, type Palette } from "./tokens";

export type ThemePref = "SYSTEM" | "LIGHT" | "DARK";
type Ctx = { c: Palette; dark: boolean; pref: ThemePref; setPref: (p: ThemePref) => void };

const ThemeCtx = createContext<Ctx | null>(null);
const KEY = "pc.theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>("SYSTEM");
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v === "LIGHT" || v === "DARK" || v === "SYSTEM") setPrefState(v); }).catch(() => {});
  }, []);
  const dark = pref === "DARK" || (pref === "SYSTEM" && system === "dark");
  const value = useMemo<Ctx>(() => ({
    c: dark ? palettes.dark : palettes.light,
    dark,
    pref,
    setPref: (p) => { setPrefState(p); AsyncStorage.setItem(KEY, p).catch(() => {}); },
  }), [dark, pref]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
