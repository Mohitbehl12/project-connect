import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { normalize, type Spec } from "@shared/style/darzi.js";

// The design in progress and the measurement profile picked, shared by the Style screens and kept on the phone.
type Ctx = { draft: Spec; setDraft: (s: Spec) => void; profileId: string | null; setProfileId: (id: string | null) => void; prompt: string; setPrompt: (p: string) => void };
const C = createContext<Ctx | null>(null);
const KEY = "kinara.style.draft";
const START = normalize({ category: "shirt", fabric: "Cotton poplin", color: "White", collar: "Mandarin", sleeves: "Full", buttons: "Hidden placket", pockets: "None", fit: "Slim", length: "Longer back", pattern: "Solid" });

export function StyleProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<Spec>(START);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => { if (v) try { const j = JSON.parse(v); setDraftState(normalize(j.draft)); setProfileId(j.profileId ?? null); } catch { /* ignore */ } }).catch(() => {}); }, []);
  const save = (d: Spec, p: string | null) => AsyncStorage.setItem(KEY, JSON.stringify({ draft: d, profileId: p })).catch(() => {});
  return (
    <C.Provider value={{ draft, prompt, setPrompt, profileId,
      setDraft: (s) => { const n = normalize(s); setDraftState(n); void save(n, profileId); },
      setProfileId: (id) => { setProfileId(id); void save(draft, id); } }}>
      {children}
    </C.Provider>
  );
}
export const useStyle = () => { const v = useContext(C); if (!v) throw new Error("useStyle outside StyleProvider"); return v; };
