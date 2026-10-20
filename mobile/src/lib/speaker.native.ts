// Earpiece / loudspeaker during calls (iPhone and Android).
import InCallManager from "react-native-incall-manager";

export const canSwitchSpeaker = true;
export function callAudioStart(video: boolean) { try { InCallManager.start({ media: video ? "video" : "audio" }); InCallManager.setForceSpeakerphoneOn(video); } catch { /* not fatal */ } }
export function setSpeaker(on: boolean) { try { InCallManager.setForceSpeakerphoneOn(on); } catch { /* not fatal */ } }
export function callAudioStop() { try { InCallManager.stop(); } catch { /* not fatal */ } }
