import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { DEFAULT_THEME, themeById, type Glow, type Palette, type Theme } from "./themes";

export type ThemePref = "SYSTEM" | "LIGHT" | "DARK";
type Ctx = {
  c: Palette; g: Glow; dark: boolean; theme: Theme;
  pref: ThemePref; setPref: (p: ThemePref) => void;
  themeId: string; setThemeId: (id: string) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);
const KEY = "kn.mode"; // light / dark / system (new key: everyone starts on the dark design once)
const COLOR_KEY = "pc.colorTheme"; // which colour theme

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  // Kinara is designed dark-first (night romance); people can switch to light or follow the phone.
  const [pref, setPrefState] = useState<ThemePref>("DARK");
  const [themeId, setThemeState] = useState(DEFAULT_THEME);
  useEffect(() => {
    AsyncStorage.multiGet([KEY, COLOR_KEY]).then(([[, v], [, t]]) => {
      if (v === "LIGHT" || v === "DARK" || v === "SYSTEM") setPrefState(v);
      if (t) setThemeState(themeById(t).id);
    }).catch(() => {});
  }, []);
  const dark = pref === "DARK" || (pref === "SYSTEM" && system === "dark");
  const value = useMemo<Ctx>(() => {
    const theme = themeById(themeId);
    return {
      c: dark ? theme.dark : theme.light, g: theme.g, dark, theme,
      pref, setPref: (p) => { setPrefState(p); AsyncStorage.setItem(KEY, p).catch(() => {}); },
      themeId: theme.id, setThemeId: (id) => { setThemeState(themeById(id).id); AsyncStorage.setItem(COLOR_KEY, id).catch(() => {}); },
    };
  }, [dark, pref, themeId]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
