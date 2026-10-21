import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";
import { recordConsent } from "./consent";

/**
 * Registers this phone for push notifications once the person is signed in.
 * Skips quietly where push can't work: simulators, web, Expo Go on Android, or before `eas init`
 * has given the project an ID (push tokens are tied to it).
 */
export async function registerForPush() {
  try {
    if (Platform.OS === "web" || !Device.isDevice) return;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "Matches and messages", importance: Notifications.AndroidImportance.HIGH, lightColor: "#5CC9A7" });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") { status = (await Notifications.requestPermissionsAsync()).status; recordConsent("PUSH", status === "granted"); }
    if (status !== "granted") return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api("/api/devices", { body: { pushToken: token, platform: Platform.OS, appVersion: Constants.expoConfig?.version } });
  } catch {
    // Push is a nice-to-have; never block the app on it.
  }
}
