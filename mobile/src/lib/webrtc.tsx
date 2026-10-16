// Web (the /app build): the browser's own WebRTC.
import { createElement, useEffect, useRef } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

const G = globalThis as any;
export const rtc = { RTCPeerConnection: G.RTCPeerConnection, RTCIceCandidate: G.RTCIceCandidate, RTCSessionDescription: G.RTCSessionDescription };
export const getMedia = (c: { audio: boolean; video: boolean | object }) => G.navigator.mediaDevices.getUserMedia(c);
export const canFlipCamera = false;
export async function flipCamera(_track: any) {}

export function VideoView({ stream, mirror, cover = true, style }: { stream: any; mirror?: boolean; cover?: boolean; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<any>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream ?? null; }, [stream]);
  if (!stream) return null;
  const s = StyleSheet.flatten(style) as any;
  return createElement("video", {
    ref, autoPlay: true, playsInline: true, muted: !!mirror,
    style: { ...s, objectFit: cover ? "cover" : "contain", transform: mirror ? "scaleX(-1)" : undefined, backgroundColor: "#000" },
  });
}
