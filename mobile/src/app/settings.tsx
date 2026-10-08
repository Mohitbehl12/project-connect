import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, Chip, Field, Screen } from "@/components/ui";
import { api, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <T v="callout" tone="muted">{title}</T>
      <View style={{ backgroundColor: c.surface, borderRadius: 20, paddingHorizontal: 16 }}>{children}</View>
    </View>
  );
}

function Toggle({ label, sub, value, onChange, disabled }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <T v="headline" style={{ fontFamily: "Figtree_600SemiBold" }}>{label}</T>
        {sub ? <T v="caption" tone="muted">{sub}</T> : null}
      </View>
      <Switch value={value} disabled={disabled} onValueChange={(v) => { haptic.tick(); onChange(v); }} trackColor={{ true: c.trust, false: c.line }} accessibilityLabel={label} />
    </View>
  );
}

export default function Settings() {
  const { me, refetchMe, signOut } = useAuth();
  const { pref, setPref } = useTheme();
  const qc = useQueryClient();
  const p = me?.preferences;
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [pw, setPw] = useState("");

  async function set(key: string, value: boolean | string) {
    setErr("");
    try { await api("/api/preferences", { method: "PUT", body: { [key]: value } }); await refetchMe(); }
    catch (e: any) { setErr(e.message); }
  }
  function theme(t: ThemePref) { setPref(t); set("theme", t); }

  async function del() {
    try {
      await api("/api/me", { method: "DELETE", body: { password: pw } });
      setDeleting(false);
      await signOut();
      router.replace("/welcome");
    } catch (e: any) { setErr(e.message); setDeleting(false); }
  }

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
        <Group title="Privacy">
          <Toggle label="Show me in Discover" sub="Turn off to take a break. Matches can still message you." value={p?.discoverable !== false} onChange={(v) => set("discoverable", v)} />
          <Toggle label="Show when I'm active" value={p?.showOnline !== false} onChange={(v) => set("showOnline", v)} />
          <Toggle label="Read receipts" value={p?.readReceipts !== false} onChange={(v) => set("readReceipts", v)} />
          <Toggle label="Incognito" sub={me?.features.incognito ? "Only people you've liked can see you." : "Only people you've liked can see you. Part of Premium Plus."} value={!!p?.incognito} disabled={!me?.features.incognito} onChange={(v) => set("incognito", v)} />
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
          {[["Terms of Service", "terms"], ["Privacy Policy", "privacy"], ["Community Guidelines", "guidelines"]].map(([l, s]) => (
            <Pressable key={s} accessibilityRole="link" onPress={() => Linking.openURL(`${API_URL}/legal/${s}`)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12 }}>
              <T style={{ flex: 1 }}>{l}</T><Icon name="forward" size={18} />
            </Pressable>
          ))}
        </Group>
        <Button title="Sign out" v="outline" icon="logout" full onPress={confirmSignOut} />
        <Button title="Delete account" v="ghost" full onPress={() => setDeleting(true)} />
      </ScrollView>

      <BottomSheet open={deleting} onClose={() => setDeleting(false)} title="Delete your account?">
        <T tone="muted">This permanently deletes your profile, photos, matches and messages. It can't be undone.</T>
        <Field label="Your password" value={pw} onChangeText={setPw} secureTextEntry />
        <Button title="Delete permanently" v="danger" size="lg" full disabled={!pw} onPress={del} />
      </BottomSheet>
    </Screen>
  );
}
