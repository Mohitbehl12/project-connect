// iPhone and Android: WebRTC from react-native-webrtc (needs a development or store build, not Expo Go).
import type { StyleProp, ViewStyle } from "react-native";
import { mediaDevices, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, RTCView } from "react-native-webrtc";

export const rtc = { RTCPeerConnection: RTCPeerConnection as any, RTCIceCandidate: RTCIceCandidate as any, RTCSessionDescription: RTCSessionDescription as any };
export const getMedia = (c: { audio: boolean; video: boolean | object }) => mediaDevices.getUserMedia(c as any) as Promise<any>;
export const canFlipCamera = true;
export async function flipCamera(track: any) {
  if (typeof track?._switchCamera === "function") return track._switchCamera();
  const facing = track?.getSettings?.().facingMode === "environment" ? "user" : "environment";
  await track?.applyConstraints?.({ facingMode: facing });
}

export function VideoView({ stream, mirror, cover = true, style }: { stream: any; mirror?: boolean; cover?: boolean; style?: StyleProp<ViewStyle> }) {
  if (!stream) return null;
  return <RTCView streamURL={stream.toURL()} mirror={mirror} objectFit={cover ? "cover" : "contain"} style={style as any} zOrder={mirror ? 1 : 0} />;
}
