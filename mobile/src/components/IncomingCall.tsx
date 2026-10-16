import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Modal, Pressable, View } from "react-native";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

type Incoming = { id: string; matchId: string; kind: "AUDIO" | "VIDEO"; state: string; from: { userId: string; name: string; photo: string | null } };

/**
 * While the app is open, waits for someone to call (a held request the server answers instantly) and
 * shows the incoming call. Calls can't ring a closed app until push notifications are set up.
 */
export function IncomingCall() {
  const { status } = useAuth();
  const { c, g } = useTheme();
  const path = usePathname();
  const [active, setActive] = useState(AppState.currentState === "active");
  const [call, setCall] = useState<Incoming | null>(null);

  useEffect(() => { const sub = AppState.addEventListener("change", (s) => setActive(s === "active")); return () => sub.remove(); }, []);

  // Wait for a call.
  useEffect(() => {
    if (status !== "signedIn" || !active || call) return;
    let stop = false;
    const ctl = new AbortController();
    (async () => {
      while (!stop) {
        try {
          const r = await api<{ call: Incoming | null }>("/api/calls/incoming?wait=25000", { signal: ctl.signal });
          if (r.call && !stop) { haptic.medium(); setCall(r.call); return; }
        } catch { if (!stop) await new Promise((x) => setTimeout(x, 4000)); }
      }
    })();
    return () => { stop = true; ctl.abort(); };
  }, [status, active, call]);

  // While it rings, notice if the caller gives up.
  useEffect(() => {
    if (!call) return;
    let stop = false;
    const ctl = new AbortController();
    (async () => {
      while (!stop) {
        try {
          const r = await api<{ call: { state: string } }>(`/api/calls/${call.id}?wait=20000&after=999999`, { signal: ctl.signal });
          if (r.call.state !== "RINGING") { setCall(null); return; }
        } catch { if (!stop) await new Promise((x) => setTimeout(x, 2000)); }
      }
    })();
    return () => { stop = true; ctl.abort(); };
  }, [call]);

  if (!call || path.startsWith("/call/")) return null;
  const decline = () => { const id = call.id; setCall(null); void api(`/api/calls/${id}`, { body: { action: "decline" } }).catch(() => {}); };
  const answer = () => {
    const x = call; setCall(null);
    router.push({ pathname: "/call/[id]", params: { id: x.id, accept: "1", name: x.from.name, photo: x.from.photo ?? "", userId: x.from.userId } });
  };
  const what = call.kind === "VIDEO" ? "video call" : "voice call";

  return (
    <Modal transparent animationType="slide" visible onRequestClose={decline}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" }}>
        <View accessibilityViewIsModal style={{ backgroundColor: g.night, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, alignItems: "center", gap: 10 }}>
          {call.from.photo ? <Image source={{ uri: call.from.photo }} style={{ width: 96, height: 96, borderRadius: 48 }} contentFit="cover" /> : <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: g.nightRaised }} />}
          <T v="title" style={{ color: "#FFFFFF" }}>{call.from.name}</T>
          <T v="callout" style={{ color: g.onNight }} accessibilityLiveRegion="assertive">Incoming {what}</T>
          <View style={{ flexDirection: "row", gap: 48, marginTop: 14 }}>
            <View style={{ alignItems: "center", gap: 6 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Decline ${what}`} onPress={decline}
                style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: "#D93A3A", alignItems: "center", justifyContent: "center" }}>
                <Icon name="hangup" size={30} color="#FFFFFF" />
              </Pressable>
              <T v="caption" style={{ color: g.onNight }}>Decline</T>
            </View>
            <View style={{ alignItems: "center", gap: 6 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Answer ${what}`} onPress={answer}
                style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: c.trust, alignItems: "center", justifyContent: "center" }}>
                <Icon name={call.kind === "VIDEO" ? "video" : "call"} size={30} color="#FFFFFF" />
              </Pressable>
              <T v="caption" style={{ color: g.onNight }}>Answer</T>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
