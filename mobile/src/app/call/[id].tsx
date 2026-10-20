import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { haptic } from "@/lib/haptics";
import { api } from "@/lib/api";
import { callAudioStart, callAudioStop, canSwitchSpeaker, setSpeaker } from "@/lib/speaker";
import { useCall } from "@/lib/useCall";
import { VideoView } from "@/lib/webrtc";
import { useTheme } from "@/theme/ThemeProvider";

const ENDED: Record<string, string> = {
  DECLINED: "Call declined", MISSED: "No answer", CANCELLED: "Call cancelled", HUNG_UP: "Call ended", FAILED: "Call dropped", BLOCKED: "Call ended",
};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Round({ icon, label, onPress, active, danger }: { icon: IconName; label: string; onPress: () => void; active?: boolean; danger?: boolean }) {
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} onPress={() => { haptic.light(); onPress(); }}
        style={({ pressed }) => ({
          width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1,
          backgroundColor: danger ? "#D93A3A" : active ? "#FFFFFF" : "rgba(255,255,255,0.16)",
        })}>
        <Icon name={icon} size={28} color={danger ? "#FFFFFF" : active ? "#1A1A1A" : "#FFFFFF"} />
      </Pressable>
      <T v="caption" style={{ color: "rgba(255,255,255,0.85)" }}>{label}</T>
    </View>
  );
}

export default function CallScreen() {
  const { id, accept, name, photo, userId } = useLocalSearchParams<{ id: string; accept?: string; name?: string; photo?: string; userId?: string }>();
  const { g } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useCall(id, accept === "1");
  const [secs, setSecs] = useState(0);
  const video = s.call?.kind === "VIDEO";
  const over = s.call?.state === "ENDED";
  const [speaker, setSpeakerOn] = useState(false);
  const kindKnown = !!s.call;
  useEffect(() => {
    if (!kindKnown) return;
    callAudioStart(video); setSpeakerOn(video); // video calls start on the loudspeaker, voice calls on the earpiece
    return () => callAudioStop();
  }, [kindKnown, video]);

  useEffect(() => {
    if (!s.connected || over) return;
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [s.connected, over]);
  useEffect(() => { if (over) { const t = setTimeout(() => router.canGoBack() ? router.back() : router.replace("/"), 1600); return () => clearTimeout(t); } }, [over]);

  const status = over ? ENDED[s.call?.endReason ?? "HUNG_UP"] ?? "Call ended"
    : s.problem ? s.problem
    : s.connected ? clock(secs)
    : s.call?.state === "RINGING" ? (s.call.incoming ? "Connecting…" : "Ringing…")
    : "Connecting…";
  const showRemoteVideo = video && s.remote && s.connected;

  return (
    <View style={{ flex: 1, backgroundColor: g.night }}>
      {/* Remote video fills the screen; for voice calls (or before video arrives) the stream still plays the sound. */}
      {s.remote ? <VideoView stream={s.remote} style={showRemoteVideo ? { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" } : { width: 1, height: 1, opacity: 0 }} /> : null}

      {!showRemoteVideo && (
        <View style={{ position: "absolute", top: insets.top + 90, left: 0, right: 0, alignItems: "center", gap: 14 }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: 132, height: 132, borderRadius: 66 }} contentFit="cover" accessibilityIgnoresInvertColors /> : <View style={{ width: 132, height: 132, borderRadius: 66, backgroundColor: g.nightRaised }} />}
        </View>
      )}

      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, alignItems: "center", gap: 4 }}>
        <T v="title" style={{ color: "#FFFFFF", marginTop: showRemoteVideo ? 0 : 236, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 }}>{name ?? "Your match"}</T>
        <T v="callout" style={{ color: showRemoteVideo ? "#FFFFFF" : g.onNight, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 }} accessibilityLiveRegion="polite">{video ? "Video call" : "Voice call"} · {status}</T>
      </View>

      {video && s.local && !s.cameraOff && !over ? (
        <View style={{ position: "absolute", top: insets.top + 16, right: 16, width: 104, height: 148, borderRadius: 16, overflow: "hidden", borderWidth: 2, borderColor: "rgba(255,255,255,0.6)" }}>
          <VideoView stream={s.local} mirror style={{ width: "100%", height: "100%" }} />
        </View>
      ) : null}

      <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 28, gap: 22 }}>
        {!over && (
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 22 }}>
            <Round icon={s.muted ? "micOff" : "mic"} label={s.muted ? "Unmute" : "Mute"} active={s.muted} onPress={s.toggleMute} />
            {canSwitchSpeaker && <Round icon="volume" label="Speaker" active={speaker} onPress={() => { setSpeaker(!speaker); setSpeakerOn(!speaker); }} />}
            {video && <Round icon={s.cameraOff ? "videoOff" : "video"} label={s.cameraOff ? "Camera on" : "Camera off"} active={s.cameraOff} onPress={s.toggleCamera} />}
            {video && s.canFlip && <Round icon="flip" label="Flip" onPress={s.flip} />}
            <Round icon="hangup" label="End" danger onPress={() => { haptic.warning(); void s.hangUp(); }} />
          </View>
        )}
        {userId ? (
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 18 }}>
            <Pressable accessibilityRole="button" onPress={() => { void s.hangUp(); router.replace({ pathname: "/report", params: { userId, name: name ?? "" } }); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 10 }}>
              <Icon name="flag" size={18} color={g.onNight} />
              <T v="callout" style={{ color: g.onNight }}>Report</T>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={async () => { void s.hangUp(); await api("/api/blocks", { body: { userId } }).catch(() => {}); router.replace("/(tabs)/messages"); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 10 }}>
              <Icon name="block" size={18} color={g.onNight} />
              <T v="callout" style={{ color: g.onNight }}>Block</T>
            </Pressable>
          </View>
        ) : null}
        {!over && !s.relay ? <T v="caption" center style={{ color: "rgba(255,255,255,0.55)", paddingHorizontal: 24 }}>Test mode: this call connects directly, so it isn't relayed privately yet.</T> : null}
      </View>
    </View>
  );
}
