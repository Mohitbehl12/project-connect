import { useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, requestRecordingPermissionsAsync, setAudioModeAsync, RecordingPresets, type RecordingOptions } from "expo-audio";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import type { Message } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";
import { recordConsent } from "@/lib/consent";

const clock = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** A photo in the chat. Photos you receive stay blurred until you tap, so nothing unwanted appears by surprise. */
export function PhotoBubble({ m, onReport }: { m: Message; onReport?: () => void }) {
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  const [revealed, setRevealed] = useState(m.mine);
  const [open, setOpen] = useState(false);
  const media = m.media!;
  const ratio = media.w && media.h ? media.h / media.w : 4 / 3;
  const w = Math.min(240, width * 0.62), h = Math.min(w * ratio, 320);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={revealed ? "Photo. Tap to open" : "Hidden photo. Tap to view"}
        onPress={() => (revealed ? setOpen(true) : setRevealed(true))} style={{ width: w, height: h, borderRadius: 18, overflow: "hidden", backgroundColor: c.raised }}>
        <Image source={{ uri: media.url }} placeholder={media.blurhash ? { blurhash: media.blurhash } : undefined} blurRadius={revealed ? 0 : 40} contentFit="cover" style={{ width: "100%", height: "100%" }} />
        {!revealed && (
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.25)", padding: 12 }}>
            <Icon name="eye" color="#FFFFFF" />
            <T v="callout" strong style={{ color: "#FFFFFF" }}>Tap to view photo</T>
            {media.checked === false && <T v="caption" center style={{ color: "#FFFFFF" }}>Not checked automatically yet</T>}
          </View>
        )}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }}>
          <Image source={{ uri: media.url }} contentFit="contain" style={{ width, height: height * 0.8 }} accessibilityLabel="Photo" />
          <View style={{ position: "absolute", top: 50, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} style={{ padding: 10 }}><Icon name="close" color="#FFFFFF" /></Pressable>
            {!m.mine && onReport && (
              <Pressable accessibilityRole="button" onPress={() => { setOpen(false); onReport(); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 10 }}>
                <Icon name="flag" color="#FFFFFF" size={18} /><T v="callout" style={{ color: "#FFFFFF" }}>Report</T>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

/** A voice message: play/pause and its length. */
export function VoiceBubble({ m }: { m: Message }) {
  const { c } = useTheme();
  const player = useAudioPlayer({ uri: m.media!.url });
  const st = useAudioPlayerStatus(player);
  const total = (st.duration ? st.duration * 1000 : 0) || m.media!.ms || 0;
  const pos = (st.currentTime ?? 0) * 1000;
  useEffect(() => { if (st.didJustFinish) { player.pause(); player.seekTo(0); } }, [st.didJustFinish, player]);
  const fg = m.mine ? "#FFFFFF" : c.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${st.playing ? "Pause" : "Play"} voice message, ${clock(total)}`}
      onPress={() => (st.playing ? player.pause() : player.play())} style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 170 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: m.mine ? "rgba(255,255,255,0.25)" : c.brandWash }}>
        {st.playing ? <View style={{ flexDirection: "row", gap: 4 }}><View style={{ width: 4, height: 14, backgroundColor: fg, borderRadius: 2 }} /><View style={{ width: 4, height: 14, backgroundColor: fg, borderRadius: 2 }} /></View>
          : <View style={{ marginLeft: 3, width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderLeftWidth: 13, borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: fg }} />}
      </View>
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: m.mine ? "rgba(255,255,255,0.35)" : c.line }}>
        <View style={{ width: `${total ? Math.min(100, (pos / total) * 100) : 0}%`, height: 4, borderRadius: 2, backgroundColor: fg }} />
      </View>
      <T v="caption" style={{ color: fg }}>{clock(st.playing || pos > 0 ? pos : total)}</T>
    </Pressable>
  );
}

const MAX_MS = 60_000;
const options = (): RecordingOptions => ({
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1, bitRate: 64000,
  web: { mimeType: typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.("audio/mp4") ? "audio/mp4" : "audio/webm", bitsPerSecond: 64000 },
});

/** Recording bar shown in place of the message box. Stops by itself at one minute. */
export function VoiceRecorder({ onSend, onCancel }: { onSend: (file: { uri: string; ms: number }) => void; onCancel: (error?: string) => void }) {
  const { c } = useTheme();
  const recorder = useAudioRecorder(options());
  const [ms, setMs] = useState(0);
  const started = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    let tick: ReturnType<typeof setInterval> | null = null;
    (async () => {
      const perm = await requestRecordingPermissionsAsync().catch(() => ({ granted: false }));
      recordConsent("MICROPHONE", perm.granted);
      if (!perm.granted) return onCancel("Allow microphone access to send voice messages.");
      try {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true }).catch(() => {});
        await recorder.prepareToRecordAsync();
        recorder.record();
        started.current = Date.now();
        tick = setInterval(() => {
          const t = Date.now() - started.current;
          setMs(t);
          if (t >= MAX_MS) void finish(true);
        }, 200);
      } catch { onCancel("Couldn't start recording. Try again."); }
    })();
    return () => { if (tick) clearInterval(tick); if (!done.current) recorder.stop().catch(() => {}); setAudioModeAsync({ allowsRecording: false }).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finish(send: boolean) {
    if (done.current) return;
    done.current = true;
    const length = Date.now() - started.current;
    await recorder.stop().catch(() => {});
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    if (!send) return onCancel();
    if (length < 800 || !recorder.uri) return onCancel("That was too short. Hold on a moment longer.");
    onSend({ uri: recorder.uri, ms: Math.min(length, MAX_MS) });
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel recording" onPress={() => finish(false)} style={{ padding: 8 }}><Icon name="trash" color={c.alert} /></Pressable>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.alert }} />
        <T accessibilityLiveRegion="polite">Recording {clock(ms)} / 1:00</T>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Send voice message" onPress={() => finish(true)}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" }}>
        <Icon name="send" color={c.brandText} />
      </Pressable>
    </View>
  );
}

/** Adds a recording to a form as "file". */
export async function appendVoice(form: FormData, uri: string) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, blob.type.includes("mp4") ? "voice.m4a" : "voice.webm");
  } else form.append("file", { uri, name: "voice.m4a", type: "audio/mp4" } as any);
}
