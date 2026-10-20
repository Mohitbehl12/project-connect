import { useQuery, useQueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Alert, Platform, ScrollView, View } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Group, LinkRow, Toggle } from "@/components/SettingsKit";
import { T } from "@/components/Text";
import { Banner, Chip, Field, Screen } from "@/components/ui";
import { api, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const PROMISES: [string, string][] = [
  ["Your exact location is never shown", "People see a rough distance (or just your city, if you hide distance)."],
  ["Your contact details stay private", "Phone number, email and date of birth are never on your profile."],
  ["Messages are encrypted on our servers", "Stored with AES-256 encryption. They're not end-to-end encrypted: our safety team can open a conversation only when it's reported."],
  ["Photos use short-lived private links", "Links to your photos expire, so they can't be passed around."],
];

/** Privacy Center: who sees you, what they see, and your data — in plain language. */
export default function PrivacyCenter() {
  const { c } = useTheme();
  const { me, refetchMe, signOut } = useAuth();
  const qc = useQueryClient();
  const p = me?.preferences;
  const blocked = useQuery({ queryKey: ["blocks"], queryFn: () => api<{ blocked: { id: string; firstName: string; blockedAt: string }[] }>("/api/blocks") });
  const [msg, setMsg] = useState<{ tone: "trust" | "alert"; text: string } | null>(null);
  const [sheet, setSheet] = useState<"messages" | "delete" | "blocked" | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function set(key: string, value: boolean | string) {
    setMsg(null);
    try { await api("/api/preferences", { method: "PUT", body: { [key]: value } }); await refetchMe(); }
    catch (e: any) { setMsg({ tone: "alert", text: e.message }); }
  }

  async function download() {
    setBusy(true); setMsg(null);
    try {
      const data = await api("/api/privacy/export");
      const text = JSON.stringify(data, null, 2);
      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        a.download = "project-connect-data.json"; a.click();
      } else {
        const f = new File(Paths.cache, "project-connect-data.json");
        if (f.exists) f.delete();
        f.create(); f.write(text);
        await Sharing.shareAsync(f.uri, { mimeType: "application/json", dialogTitle: "Your Kinara data" });
      }
      haptic.success();
    } catch (e: any) { setMsg({ tone: "alert", text: e.message }); } finally { setBusy(false); }
  }

  async function deleteMessages() {
    setBusy(true);
    try { const r = await api<{ deleted: number }>("/api/privacy/messages", { body: {} }); setMsg({ tone: "trust", text: `Deleted ${r.deleted} messages you sent.` }); setSheet(null); qc.invalidateQueries({ queryKey: ["matches"] }); }
    catch (e: any) { setMsg({ tone: "alert", text: e.message }); } finally { setBusy(false); }
  }

  async function deleteAccount() {
    setBusy(true);
    try {
      const r = await api<{ storeNote?: string | null }>("/api/me", { method: "DELETE", body: { password: pw } });
      setSheet(null); await signOut(); router.replace("/welcome");
      // A store subscription isn't stopped by deleting the account; tell the person how to stop it.
      if (r?.storeNote) Alert.alert("One more step", r.storeNote);
    } catch (e: any) { setMsg({ tone: "alert", text: e.message }); setSheet(null); } finally { setBusy(false); }
  }

  async function unblock(id: string) {
    await api(`/api/blocks?userId=${id}`, { method: "DELETE" }).catch(() => {});
    blocked.refetch();
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Privacy Center" sub="You decide who sees you and what they see." />
      <ScrollView contentContainerStyle={{ gap: 22, paddingBottom: 40 }}>
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        <Group title="Who can see me">
          <Toggle label="Show me in Discover" sub="Turn off to take a break. Your matches can still message you." value={p?.discoverable !== false} onChange={(v) => set("discoverable", v)} />
          <Toggle label="Incognito" sub={me?.features.incognito ? "Only people you've liked can see you." : "Only people you've liked can see you. Part of Premium Plus."} value={!!p?.incognito} disabled={!me?.features.incognito} onChange={(v) => set("incognito", v)} />
          <View style={{ paddingVertical: 12, gap: 8 }}>
            <T v="headline" style={{ fontFamily: "Figtree_600SemiBold" }}>Who can like me</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Chip label="Everyone" selected={(p?.likesFrom ?? "EVERYONE") === "EVERYONE"} onPress={() => set("likesFrom", "EVERYONE")} />
              <Chip label="Verified people only" selected={p?.likesFrom === "VERIFIED"} onPress={() => set("likesFrom", "VERIFIED")} />
            </View>
            <T v="caption" tone="muted">With “verified only”, people without the verified badge won't see you in Discover.</T>
          </View>
        </Group>
        <Group title="What people see">
          <Toggle label="Show my distance" sub="Off: people see only your city." value={p?.showDistance !== false} onChange={(v) => set("showDistance", v)} />
          <Toggle label="Show when I'm active" value={p?.showOnline !== false} onChange={(v) => set("showOnline", v)} />
          <Toggle label="Read receipts" sub="Let matches see when you've read their messages." value={p?.readReceipts !== false} onChange={(v) => set("readReceipts", v)} />
          <LinkRow icon="pin" label="Location permission" sub="Used only to work out distances. Change it in your phone's settings." onPress={() => import("react-native").then(({ Linking }) => Linking.openSettings())} />
        </Group>
        <Group title="People you've blocked">
          <LinkRow icon="block" label={`${blocked.data?.blocked.length ?? 0} blocked`} sub="They can't see you or message you." onPress={() => setSheet("blocked")} />
        </Group>
        <Group title="Your data">
          <LinkRow icon="download" label={busy ? "Preparing…" : "Download my data"} sub="Everything we hold about you, as a file." onPress={download} />
          <LinkRow icon="messages" label="Delete my messages" sub="Removes the messages you've sent in every chat." onPress={() => setSheet("messages")} />
          <LinkRow icon="trash" label="Delete my account" tone="alert" onPress={() => setSheet("delete")} />
        </Group>
        <View style={{ backgroundColor: c.surface, borderRadius: 20, padding: 16, gap: 12 }}>
          <T v="headline">How we protect you</T>
          {PROMISES.map(([t, b]) => (
            <View key={t} style={{ flexDirection: "row", gap: 10 }}>
              <Icon name="shield" size={20} color={c.trust} />
              <View style={{ flex: 1 }}><T v="callout" strong>{t}</T><T v="caption" tone="muted">{b}</T></View>
            </View>
          ))}
          <Button title="Read the Privacy Policy" v="ghost" onPress={() => import("react-native").then(({ Linking }) => Linking.openURL(`${API_URL}/legal/privacy`))} />
        </View>
      </ScrollView>

      <BottomSheet open={sheet === "blocked"} onClose={() => setSheet(null)} title="Blocked">
        {!blocked.data?.blocked.length && <T tone="muted">You haven't blocked anyone.</T>}
        {blocked.data?.blocked.map((b) => (
          <View key={b.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
            <T>{b.firstName}</T><Button title="Unblock" v="outline" onPress={() => unblock(b.id)} />
          </View>
        ))}
      </BottomSheet>
      <BottomSheet open={sheet === "messages"} onClose={() => setSheet(null)} title="Delete your messages?">
        <T tone="muted">Every message you've sent will show as “Message deleted” for the other person. We keep deleted messages for a short time in case they're needed for a safety report, then remove them for good.</T>
        <Button title="Delete my messages" v="danger" full loading={busy} onPress={deleteMessages} />
      </BottomSheet>
      <BottomSheet open={sheet === "delete"} onClose={() => setSheet(null)} title="Delete your account?">
        <T tone="muted">Your profile, photos, likes and matches are deleted now and you'll be signed out everywhere. A subscription paid on our website stops renewing; one paid through the App Store or Google Play must be cancelled in your phone's subscription settings. We keep payment records because tax law requires it, and deleted messages briefly for safety reviews.</T>
        <Field label="Your password" value={pw} onChangeText={setPw} secureTextEntry />
        <Button title="Delete permanently" v="danger" size="lg" full disabled={!pw} loading={busy} onPress={deleteAccount} />
      </BottomSheet>
    </Screen>
  );
}
