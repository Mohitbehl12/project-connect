import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Group, LinkRow } from "@/components/SettingsKit";
import { T } from "@/components/Text";
import { Banner, Field, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { niceDate } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

type Device = { id: string; name: string; platform: string; signedInAt: string; lastActiveAt: string; current: boolean };
type Login = { at: string; success: boolean; platform: string | null; device: string | null; network: string | null; reason: string | null };

const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 2 ? "now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : niceDate(d);
};

/** Security: devices, sign-in history, 2-step verification and password. */
export default function Security() {
  const { c } = useTheme();
  const { signOut } = useAuth();
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api<{ devices: Device[] }>("/api/security/sessions") });
  const logins = useQuery({ queryKey: ["logins"], queryFn: () => api<{ logins: Login[] }>("/api/security/logins") });
  const totp = useQuery({ queryKey: ["totp"], queryFn: () => api<{ enabled: boolean }>("/api/security/totp") });
  const [msg, setMsg] = useState<{ tone: "trust" | "alert"; text: string } | null>(null);
  const [sheet, setSheet] = useState<"totp" | "totp-off" | "password" | "all" | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string): Promise<boolean> {
    setBusy(true); setMsg(null);
    try { await fn(); haptic.success(); setMsg({ tone: "trust", text: ok }); setSheet(null); setCode(""); setPw(""); setPw2(""); devices.refetch(); totp.refetch(); return true; }
    catch (e: any) { setMsg({ tone: "alert", text: e.message }); haptic.warning(); setSheet(null); return false; } finally { setBusy(false); }
  }

  async function startTotp() {
    setMsg(null);
    try { setSetup(await api("/api/security/totp", { body: { action: "start" } })); setSheet("totp"); }
    catch (e: any) { setMsg({ tone: "alert", text: e.message }); }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Security" sub="Keep your account yours." />
      <ScrollView contentContainerStyle={{ gap: 22, paddingBottom: 40 }}>
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        <Group title="Signed-in devices" foot="Don't recognise a device? Sign it out, then change your password.">
          {devices.data?.devices.map((d) => (
            <View key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.raised, alignItems: "center", justifyContent: "center" }}><Icon name="phone" size={20} color={c.brand} /></View>
              <View style={{ flex: 1 }}>
                <T v="headline" style={{ fontFamily: "Figtree_600SemiBold" }}>{d.name}{d.current ? "  · this device" : ""}</T>
                <T v="caption" tone="muted">Active {ago(d.lastActiveAt)} · signed in {niceDate(d.signedInAt)}</T>
              </View>
              {!d.current && <Button title="Sign out" v="ghost" onPress={() => run(() => api("/api/security/sessions", { body: { action: "revoke", id: d.id } }), `${d.name} was signed out.`)} />}
            </View>
          ))}
          {devices.data && devices.data.devices.length > 1 && <LinkRow icon="logout" label="Sign out of all other devices" onPress={() => run(() => api("/api/security/sessions", { body: { action: "others" } }), "Every other device was signed out.")} />}
          <LinkRow icon="logout" label="Log out of all devices" sub="Including this one and any web browser." tone="alert" onPress={() => setSheet("all")} />
        </Group>

        <Group title="Sign-in protection">
          <LinkRow icon="key" label={totp.data?.enabled ? "2-step verification is on" : "Turn on 2-step verification"} sub={totp.data?.enabled ? "You'll enter a code from your authenticator app when you sign in." : "Use an authenticator app for a code at sign-in."} onPress={() => (totp.data?.enabled ? setSheet("totp-off") : startTotp())} />
          <LinkRow icon="lock" label="Change password" sub="Signs you out everywhere afterwards." onPress={() => setSheet("password")} />
        </Group>

        <Group title="Recent sign-ins">
          {logins.data?.logins.slice(0, 10).map((l, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
              <Icon name={l.success ? "check" : "close"} size={18} color={l.success ? c.trust : c.alert} />
              <View style={{ flex: 1 }}>
                <T v="callout">{l.success ? "Signed in" : l.reason ?? "Failed"} · {l.device ?? (l.platform === "ios" ? "iPhone" : l.platform === "android" ? "Android" : "Web")}</T>
                <T v="caption" tone="muted">{ago(l.at)}{l.network ? ` · network ${l.network}` : ""}</T>
              </View>
            </View>
          ))}
          {logins.data && !logins.data.logins.length && <T tone="muted" style={{ paddingVertical: 12 }}>No sign-ins recorded yet.</T>}
        </Group>
      </ScrollView>

      <BottomSheet open={sheet === "all"} onClose={() => setSheet(null)} title="Log out everywhere?">
        <T tone="muted">Every phone and browser signed in to your account — including this one — will need your password again.</T>
        <Button title="Log out of all devices" v="danger" full loading={busy} onPress={async () => { if (await run(() => api("/api/security/sessions", { body: { action: "all" } }), "Signed out everywhere.")) { await signOut(); router.replace("/welcome"); } }} />
      </BottomSheet>

      <BottomSheet open={sheet === "totp"} onClose={() => setSheet(null)} title="Set up 2-step verification">
        <T tone="muted">1. Open your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) and add this key, or tap “Open authenticator”.</T>
        <View style={{ backgroundColor: c.raised, borderRadius: 14, padding: 12 }}><T selectable style={{ fontFamily: "Figtree_700Bold", letterSpacing: 2, textAlign: "center" }}>{setup?.secret.match(/.{1,4}/g)?.join(" ")}</T></View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button title="Copy key" v="outline" icon="copy" style={{ flex: 1 }} onPress={() => setup && Clipboard.setStringAsync(setup.secret)} />
          <Button title="Open authenticator" v="outline" style={{ flex: 1 }} onPress={() => setup && Linking.openURL(setup.otpauthUrl).catch(() => setMsg({ tone: "alert", text: "No authenticator app found — copy the key instead." }))} />
        </View>
        <T tone="muted">2. Enter the 6-digit code it shows.</T>
        <Field label="Code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} />
        <Button title="Turn on" full loading={busy} disabled={code.length !== 6} onPress={() => run(() => api("/api/security/totp", { body: { action: "confirm", code } }), "2-step verification is on.")} />
      </BottomSheet>

      <BottomSheet open={sheet === "totp-off"} onClose={() => setSheet(null)} title="Turn off 2-step verification?">
        <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry />
        <Field label="Code from your app" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} />
        <Button title="Turn off" v="danger" full loading={busy} disabled={!pw || code.length !== 6} onPress={() => run(() => api("/api/security/totp", { body: { action: "disable", password: pw, code } }), "2-step verification is off.")} />
      </BottomSheet>

      <BottomSheet open={sheet === "password"} onClose={() => setSheet(null)} title="Change password">
        <Field label="Current password" value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" />
        <Field label="New password" value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" hint="At least 8 characters with a letter and a number." />
        <Button title="Change password" full loading={busy} disabled={!pw || pw2.length < 8} onPress={async () => { if (await run(() => api("/api/security/password", { body: { current: pw, next: pw2 } }), "Password changed. Please sign in again.")) { await signOut(); router.replace("/sign-in"); } }} />
      </BottomSheet>
    </Screen>
  );
}
