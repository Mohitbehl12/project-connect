import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, Chip, Screen } from "@/components/ui";
import { api, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { Group, LinkRow, Toggle } from "@/components/SettingsKit";

export default function Settings() {
  const { me, refetchMe, signOut } = useAuth();
  const { pref, setPref } = useTheme();
  const qc = useQueryClient();
  const p = me?.preferences;
  const [err, setErr] = useState("");

  async function set(key: string, value: boolean | string) {
    setErr("");
    try { await api("/api/preferences", { method: "PUT", body: { [key]: value } }); await refetchMe(); }
    catch (e: any) { setErr(e.message); }
  }
  function theme(t: ThemePref) { setPref(t); set("theme", t); }

  const confirmSignOut = () => {
    const go = async () => { await signOut(); qc.clear(); router.replace("/welcome"); };
    if (Platform.OS === "web") go(); else Alert.alert("Sign out?", undefined, [{ text: "Cancel", style: "cancel" }, { text: "Sign out", onPress: go }]);
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Settings" />
      <ScrollView contentContainerStyle={{ gap: 22, paddingBottom: 32 }}>
        {err ? <Banner tone="alert">{err}</Banner> : null}
        <Group title="Appearance">
          <View style={{ flexDirection: "row", gap: 8, paddingVertical: 12 }}>
            {(["SYSTEM", "LIGHT", "DARK"] as ThemePref[]).map((t) => <Chip key={t} label={t === "SYSTEM" ? "System" : t === "LIGHT" ? "Light" : "Dark"} selected={pref === t} onPress={() => theme(t)} />)}
          </View>
        </Group>
        <Group title="Account & safety">
          <LinkRow icon="eye" label="Privacy Center" sub="Who sees you, your data, deleting your account" href="/privacy" />
          <LinkRow icon="key" label="Security" sub="Devices, sign-ins, 2-step verification, password" href="/security" />
          <LinkRow icon="shield" label="Safety Center" sub="Verification, reporting, date safety" href="/safety" />
        </Group>
        <Group title="Premium">
          <LinkRow icon="card" label="My subscription" sub="Plan, next payment, invoices, cancel" href="/subscription" />
          <LinkRow icon="gift" label="Invite & earn" sub="Premium days for every verified friend" href="/referrals" />
        </Group>
        <Group title="Notifications">
          <Toggle label="New matches" value={p?.notifyMatches !== false} onChange={(v) => set("notifyMatches", v)} />
          <Toggle label="New messages" value={p?.notifyMessages !== false} onChange={(v) => set("notifyMessages", v)} />
          <Toggle label="New likes" value={p?.notifyLikes !== false} onChange={(v) => set("notifyLikes", v)} />
        </Group>
        <Group title="Account">
          <View style={{ paddingVertical: 12, gap: 2 }}>
            <T v="caption" tone="muted">Signed in as</T>
            <T>{me?.user.email}</T>
          </View>
          {[["Terms of Service", "terms"], ["Privacy Policy", "privacy"], ["Community Guidelines", "guidelines"], ["Payment Terms", "payments"], ["Cancellation & Refund Policy", "refunds"]].map(([l, s]) => (
            <Pressable key={s} accessibilityRole="link" onPress={() => Linking.openURL(`${API_URL}/legal/${s}`)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12 }}>
              <T style={{ flex: 1 }}>{l}</T><Icon name="forward" size={18} />
            </Pressable>
          ))}
        </Group>
        <Button title="Sign out" v="outline" icon="logout" full onPress={confirmSignOut} />

      </ScrollView>

    </Screen>
  );
}
