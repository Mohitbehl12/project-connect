import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import { T } from "@/components/Text";
import { api } from "./api";
import { useTheme } from "@/theme/ThemeProvider";

// Each app (iPhone, Android, web) is released separately. The server tells this app which features are on
// for its platform and whether it must or may update (Admin → Apps).
export type AppFeature = "calls" | "checkin" | "cupid" | "ads" | "referrals" | "premium" | "feedback";
type AppConfig = { platform: string; features: Record<AppFeature, boolean>; minVersion: string; latestVersion: string; storeUrl: string | null; message: string | null; updateRequired: boolean; updateAvailable: boolean };

export function useAppConfig() {
  return useQuery({ queryKey: ["app-config"], queryFn: () => api<AppConfig>("/api/public/app-config", { auth: false }), staleTime: 30 * 60_000, retry: 1 });
}

/** On unless this platform's switch is off. While loading (or offline) features stay on — the server still enforces its rules. */
export function useFeature(f: AppFeature) {
  return useAppConfig().data?.features?.[f] !== false;
}

/** Blocks the app when this version is below the minimum; a gentle banner when a newer one exists. */
export function UpdateGate() {
  const q = useAppConfig();
  const { c } = useTheme();
  const [later, setLater] = useState(false);
  const d = q.data;
  if (!d || Platform.OS === "web") return null;
  const open = () => { if (d.storeUrl) Linking.openURL(d.storeUrl).catch(() => {}); };
  if (d.updateRequired) return (
    <View accessibilityViewIsModal style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 28, gap: 14, zIndex: 100 }}>
      <T v="title" center>Time to update Twofold</T>
      <T tone="muted" center>{d.message ?? "This version is no longer supported. The update keeps your matches and messages."}</T>
      {d.storeUrl ? (
        <Pressable accessibilityRole="button" onPress={open} style={{ marginTop: 6, backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 28, paddingVertical: 14 }}>
          <T strong style={{ color: c.brandText }}>{Platform.OS === "ios" ? "Update on the App Store" : "Update on Google Play"}</T>
        </Pressable>
      ) : <T v="caption" tone="faint" center>Open the store app to update.</T>}
    </View>
  );
  if (d.updateAvailable && !later) return (
    <View style={{ position: "absolute", left: 12, right: 12, bottom: 96, padding: 12, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, flexDirection: "row", alignItems: "center", gap: 10, zIndex: 50 }}>
      <T v="callout" style={{ flex: 1 }}>{d.message ?? "A new version of Twofold is available."}</T>
      {d.storeUrl && <Pressable accessibilityRole="button" onPress={open}><T v="callout" strong>Update</T></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={() => setLater(true)}><T v="callout" tone="muted">Later</T></Pressable>
    </View>
  );
  return null;
}
