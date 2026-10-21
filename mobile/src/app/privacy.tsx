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
  ["We never use GPS", "Your location is the city you chose. People see a rounded distance like “Within 10 km”, or nothing if you hide it."],
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
  const [sheet, setSheet] = useState<"messages" | "delete" | "blocked" | "consents" | "decisions" | "pause" | null>(null);
  const consents = useQuery({ queryKey: ["consents"], enabled: sheet === "consents", queryFn: () => api<{ current: { kind: string; label: string; granted: boolean; required: boolean; withdrawable: boolean; at: string | null; asked?: boolean }[]; history: { kind: string; label: string; granted: boolean; at: string; version: string | null }[] }>("/api/consents") });
  const decisions = useQuery({ queryKey: ["decisions"], enabled: sheet === "decisions", queryFn: () => api<{ restricted: boolean; decisions: { id: string; kind: string; decision: string; reason: string; at: string; reviewed: string | null }[] }>("/api/privacy/decisions") });
  const retention = useQuery({ queryKey: ["retention"], enabled: sheet === "delete", queryFn: () => api<{ schedule: { what: string; keep: string }[] }>("/api/privacy/retention") });
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
        a.download = "kinara-data.json"; a.click();
      } else {
        const f = new File(Paths.cache, "kinara-data.json");
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

  async function setConsent(kind: string, granted: boolean) {
    try { await api("/api/consents", { body: { kind, granted } }); consents.refetch(); await refetchMe(); }
    catch (e: any) { setMsg({ tone: "alert", text: e.message }); }
  }

  async function pause(paused: boolean) {
    setBusy(true);
    try { await api("/api/privacy/pause", { body: { paused } }); await refetchMe(); setSheet(null); setMsg({ tone: "trust", text: paused ? "Your profile is paused. Nobody new can find, like, message or call you." : "Welcome back — your profile is visible again." }); }
    catch (e: any) { setMsg({ tone: "alert", text: e.message }); } finally { setBusy(false); }
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
        {me?.user.paused && <Banner tone="info">Your profile is paused. Turn it back on below whenever you're ready.</Banner>}
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
          <View style={{ paddingVertical: 12, gap: 8 }}>
            <T v="headline" style={{ fontFamily: "Figtree_600SemiBold" }}>Who can see my profile</T>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Chip label="Everyone" selected={(p?.profileVisibility ?? "EVERYONE") === "EVERYONE"} onPress={() => set("profileVisibility", "EVERYONE")} />
              <Chip label="Verified people only" selected={p?.profileVisibility === "VERIFIED"} onPress={() => set("profileVisibility", "VERIFIED")} />
            </View>
          </View>
          <View style={{ paddingVertical: 12, gap: 8 }}>
            <T v="headline" style={{ fontFamily: "Figtree_600SemiBold" }}>Who can see all my photos</T>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Chip label="Everyone" selected={(p?.photosVisibility ?? "EVERYONE") === "EVERYONE"} onPress={() => set("photosVisibility", "EVERYONE")} />
              <Chip label="Matches only" selected={p?.photosVisibility === "MATCHES"} onPress={() => set("photosVisibility", "MATCHES")} />
            </View>
            <T v="caption" tone="muted">With “matches only”, others see just your first photo.</T>
          </View>
          <LinkRow icon="call" label="Who can send call requests" sub={p?.callRequests === "NOBODY" ? "Nobody" : "My matches"} onPress={() => router.push("/settings")} />
          <LinkRow icon="eye" label={me?.user.paused ? "Turn my profile back on" : "Pause my profile"} sub="Hide everywhere without deleting anything." onPress={() => (me?.user.paused ? pause(false) : setSheet("pause"))} />
        </Group>
        <Group title="What people see">
          <Toggle label="Show my distance" sub="Rounded, e.g. “Within 10 km”. Off: no distance at all." value={p?.showDistance !== false} onChange={(v) => set("showDistance", v)} />
          <Toggle label="Show my city" sub="Off: people see only your country." value={p?.showCity !== false} onChange={(v) => set("showCity", v)} />
          <Toggle label="Show when I'm active" value={p?.showOnline !== false} onChange={(v) => set("showOnline", v)} />
          <Toggle label="Read receipts" sub="Let matches see when you've read their messages." value={p?.readReceipts !== false} onChange={(v) => set("readReceipts", v)} />
        </Group>
        <AdsGroup />
        <Group title="People you've blocked">
          <LinkRow icon="block" label={`${blocked.data?.blocked.length ?? 0} blocked`} sub="They can't see you or message you." onPress={() => setSheet("blocked")} />
        </Group>
        <Group title="Your choices">
          <LinkRow icon="check" label="Your consents" sub="What you've agreed to, when, and turn optional ones off." onPress={() => setSheet("consents")} />
          <LinkRow icon="sparkle" label="Automated decisions about you" sub="Safety checks that affected your account, and how to appeal." onPress={() => setSheet("decisions")} />
          <LinkRow icon="flag" label="Your reports and appeals" sub="Case numbers and status." onPress={() => router.push("/safety")} />
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
      <BottomSheet open={sheet === "pause"} onClose={() => setSheet(null)} title="Pause your profile?">
        <T tone="muted">You'll disappear from Discover and Likes. Nobody can like you, start a chat or ask to call. Your matches, chats and settings stay as they are, and you can turn your profile back on any time.</T>
        <Button title="Pause my profile" full loading={busy} onPress={() => pause(true)} />
      </BottomSheet>
      <BottomSheet open={sheet === "consents"} onClose={() => setSheet(null)} title="Your consents">
        {consents.data?.current.map((x) => x.withdrawable ? (
          <Toggle key={x.kind} label={x.label} sub={x.at ? `${x.granted ? "On" : "Off"} since ${new Date(x.at).toLocaleDateString()}` : x.asked ? (x.granted ? "On" : "Off") : "Not asked yet — we ask when a feature first needs it"} value={x.granted} onChange={(v) => setConsent(x.kind, v)} />
        ) : (
          <View key={x.kind} style={{ paddingVertical: 8 }}><T v="callout" strong>{x.label}</T><T v="caption" tone="muted">{x.at ? `Agreed ${new Date(x.at).toLocaleDateString()}` : "—"} · needed to use Kinara (delete your account to withdraw)</T></View>
        ))}
        <T v="caption" tone="muted">Camera, microphone and notifications are also controlled by your phone. Turning one off here records your choice; to block access completely, change it in your phone's settings.</T>
      </BottomSheet>
      <BottomSheet open={sheet === "decisions"} onClose={() => setSheet(null)} title="Automated decisions">
        {decisions.data?.restricted && <Banner tone="alert">New likes, call requests and new chats are paused on your account. Complete the selfie check in Safety, or appeal.</Banner>}
        {!decisions.data?.decisions.length && <T tone="muted">No automated decisions have affected your account.</T>}
        {decisions.data?.decisions.map((d) => (
          <View key={d.id} style={{ paddingVertical: 8, gap: 2 }}>
            <T v="callout" strong>{d.kind.replace(/_/g, " ").toLowerCase().replace(/^./, (m) => m.toUpperCase())} · {d.decision.replace(/_/g, " ").toLowerCase()}</T>
            <T v="caption" tone="muted">{d.reason}</T>
            <T v="caption" tone="faint">{new Date(d.at).toLocaleString()}{d.reviewed ? ` · reviewed: ${d.reviewed.toLowerCase()}` : ""}</T>
          </View>
        ))}
        <Button title="Appeal a decision" v="outline" full onPress={() => { setSheet(null); router.push({ pathname: "/safety", params: { appeal: "1" } }); }} />
      </BottomSheet>
      <BottomSheet open={sheet === "messages"} onClose={() => setSheet(null)} title="Delete your messages?">
        <T tone="muted">Every message you've sent will show as “Message deleted” for the other person. We keep deleted messages for a short time in case they're needed for a safety report, then remove them for good.</T>
        <Button title="Delete my messages" v="danger" full loading={busy} onPress={deleteMessages} />
      </BottomSheet>
      <BottomSheet open={sheet === "delete"} onClose={() => setSheet(null)} title="Delete your account?">
        <T tone="muted">Deletion happens straight away: your profile, photos, likes and matches are deleted and you're signed out everywhere. It can't be undone. A subscription paid on our website stops renewing; one paid through the App Store or Google Play must be cancelled in your phone's subscription settings.</T>
        <T v="callout" strong>What we keep, and for how long</T>
        {retention.data?.schedule.filter((r) => !r.what.startsWith("Profile")).slice(0, 12).map((r) => <T key={r.what} v="caption" tone="muted">• {r.what}: {r.keep}</T>)}
        <T v="caption" tone="muted">If someone reported your account, or it's part of a legal case, we keep the related records until that ends. Want a break instead? Pause your profile.</T>
        <Field label="Your password" value={pw} onChangeText={setPw} secureTextEntry />
        <Button title="Delete permanently" v="danger" size="lg" full disabled={!pw} loading={busy} onPress={deleteAccount} />
      </BottomSheet>
    </Screen>
  );
}

/** Ads: a few Sponsored items are shown either way; this decides whether gender and interests are used to pick them. */
function AdsGroup() {
  const q = useQuery({ queryKey: ["consents", "ads"], queryFn: () => api<{ current: { kind: string; granted: boolean }[] }>("/api/consents") });
  const on = q.data?.current.find((x) => x.kind === "PERSONALISED_ADS")?.granted ?? false;
  return (
    <Group title="Ads">
      <Toggle label="Personalised ads" sub="Use my gender and interests to choose the few Sponsored ads I see. Advertisers never learn who I am. Off: ads are less relevant, not more frequent."
        value={on} disabled={!q.data} onChange={async (v) => { await api("/api/consents", { body: { kind: "PERSONALISED_ADS", granted: v } }).catch(() => {}); q.refetch(); }} />
    </Group>
  );
}
