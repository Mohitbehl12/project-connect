import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { fxState } from "./fx";

// Thin wrapper so screens never have to care whether the device supports haptics.
const on = Platform.OS === "ios" || Platform.OS === "android";
// Follows Settings › Experience › Haptics.
const safe = (fn: () => Promise<void>) => { if (on && fxState.haptics) fn().catch(() => {}); };

export const haptic = {
  tick: () => safe(() => Haptics.selectionAsync()),
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
