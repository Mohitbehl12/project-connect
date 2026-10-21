import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { REPORT_CATEGORIES } from "@shared/constants";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon, VerifiedBadge } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, Chip, Screen } from "@/components/ui";
import { recordConsent } from "@/lib/consent";
import { api } from "@/lib/api";
import { appendPhoto } from "@/lib/photoFile";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const TIPS = [
  ["Keep it here at first", "Scammers push to move to other apps quickly. We screen messages here."],
  ["Never send money", "No genuine match needs a loan, gift card, customs fee or crypto tip."],
  ["Meet in public, tell a friend", "Pick a busy café, share your plans, arrange your own travel."],
  ["Video call first", "A short call helps confirm they're who their profile says."],
  ["Trust your instincts", "You can unmatch, block or report at any time — they won't be told it was you."],
];
const HELPLINES = [["India", "112 · women's helpline 1091 · cyber fraud 1930"], ["US", "911"], ["UK", "999"], ["UAE", "999"], ["Singapore", "999"], ["Australia", "000"]];

export default function Safety() {
  const { me, refetchMe } = useAuth();
  const { c } = useTheme();
  const [msg, setMsg] = useState("");
  const reports = useQuery({ queryKey: ["my-reports"], queryFn: () => api<{ reports: { id: string; caseNo: string | null; category: string; status: string; createdAt: string }[] }>("/api/reports") });
  const appeals = useQuery({ queryKey: ["my-appeals"], queryFn: () => api<{ kinds: Record<string, string>; appeals: { caseNo: string; kind: string; status: string; decision: string | null; createdAt: string }[] }>("/api/appeals") });
  const params = useLocalSearchParams<{ appeal?: string }>();
  const [appealOpen, setAppealOpen] = useState(params.appeal === "1");
  const [appeal, setAppeal] = useState({ kind: me?.user.restricted ? "RESTRICTION" : "AUTOMATED", details: "" });
  const [appealMsg, setAppealMsg] = useState<{ tone: "trust" | "alert"; text: string } | null>(null);
  async function sendAppeal() {
    setAppealMsg(null);
    try {
      const r = await api<{ message: string }>("/api/appeals", { body: appeal });
      setAppealMsg({ tone: "trust", text: r.message }); setAppeal({ ...appeal, details: "" }); setAppealOpen(false); appeals.refetch(); haptic.success();
    } catch (e: any) { setAppealMsg({ tone: "alert", text: e.message }); }
  }
  const blocks = useQuery({ queryKey: ["blocks"], queryFn: () => api<{ blocked: { id: string; firstName: string }[] }>("/api/blocks") });
  const status = me?.user.selfieStatus;

  const [pose, setPose] = useState<{ attemptId: string; text: string; emoji: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1: get a random pose. Step 2: a front-camera selfie doing it. The server checks for one face
  // and compares it with the profile photos; a person on the team makes the final decision.
  async function verify() {
    setMsg("");
    try {
      const r = await api<{ attemptId: string; pose: { text: string; emoji: string } }>("/api/verification", { method: "POST" });
      setPose({ attemptId: r.attemptId, ...r.pose });
    } catch (e: any) { setMsg(e.message); }
  }
  async function takeSelfie() {
    if (!pose) return;
    setMsg("");
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      recordConsent("CAMERA", perm.granted);
      if (!perm.granted) { setMsg("Allow camera access in Settings to take your verification selfie."); return; }
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], cameraType: ImagePicker.CameraType.front, quality: 0.85 });
    if (shot.canceled || !shot.assets?.[0]) return;
    const asset = shot.assets[0];
    setBusy(true);
    try {
      const form = new FormData();
      form.append("attemptId", pose.attemptId);
      await appendPhoto(form, asset, "selfie.jpg");
      const r = await api<{ state: "RETAKE" | "PENDING"; message: string }>("/api/verification/selfie", { form });
      setMsg(r.message);
      if (r.state === "PENDING") { haptic.success(); setPose(null); refetchMe(); } else haptic.warning();
    } catch (e: any) {
      setMsg(e.message);
      if (e.code === "expired" || e.code === "not_found" || e.code === "already_sent") setPose(null);
    } finally { setBusy(false); }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Safety Center" sub="Tools and advice for meeting people safely." />
      <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {me?.user.restricted && (
          <Banner tone="alert">New likes, call requests and new chats are paused on your account while it's reviewed. Your existing chats still work. Completing the selfie check below usually lifts this; you can also appeal.</Banner>
        )}
        {me?.user.status === "SUSPENDED" && <Banner tone="alert">Your account is suspended while our team reviews it. If you think this is a mistake, appeal below.</Banner>}
        <View style={{ backgroundColor: c.trustWash, borderRadius: 22, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {status === "VERIFIED" ? <VerifiedBadge size={30} /> : <Icon name="shield" size={30} color={c.trust} />}
            <T v="headline" style={{ flex: 1 }}>{status === "VERIFIED" ? "You're verified" : status === "PENDING" ? "Verification under review" : "Verify your profile"}</T>
          </View>
          <T v="callout" tone="muted">{status === "VERIFIED" ? "Your profile shows the sage ring." : status === "PENDING" ? "We'll let you know as soon as it's done." : "A quick selfie check earns the sage ring and more trust from matches."}</T>
          {(status === "NONE" || status === "REJECTED") && !pose && <Button title="Verify me" onPress={verify} />}
          {pose && status !== "PENDING" ? (
            <View style={{ backgroundColor: c.surface, borderRadius: 18, padding: 14, gap: 8, alignItems: "center" }}>
              <T v="callout" tone="muted">Take a selfie with the front camera while you:</T>
              <T style={{ fontSize: 44 }} accessibilityElementsHidden>{pose.emoji}</T>
              <T v="headline" style={{ textAlign: "center" }}>{pose.text}</T>
              <T v="caption" tone="muted" style={{ textAlign: "center" }}>Just you, face clearly visible, good light, no sunglasses. A person on our team compares it with your profile photos, then the selfie is deleted.</T>
              {busy ? <ActivityIndicator color={c.brand} /> : <Button title="Take selfie" onPress={takeSelfie} />}
            </View>
          ) : null}
          {msg ? <T v="callout">{msg}</T> : null}
          <T v="caption" tone="muted">What “verified” means: the person's selfie matched their profile photos when we checked. It doesn't prove their name or age, or that they're safe — keep following the tips below.</T>
        </View>

        <View style={{ gap: 10 }}>
          <T v="headline">How to report or block</T>
          <T tone="muted">Long-press any card in Discover, tap the shield on a profile, or tap the shield in a chat. Reporting always blocks them too.</T>
        </View>

        <View style={{ gap: 10 }}>
          <T v="headline">Dating safely</T>
          {TIPS.map(([t, b]) => (
            <View key={t} style={{ backgroundColor: c.surface, borderRadius: 18, padding: 14, gap: 2 }}>
              <T v="callout" strong>{t}</T>
              <T v="callout" tone="muted">{b}</T>
            </View>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <T v="headline">Your reports</T>
          {!reports.data?.reports.length ? <T tone="muted">You haven't reported anyone.</T> : reports.data.reports.map((r) => (
            <View key={r.id} style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: c.surface, borderRadius: 16, padding: 14 }}>
              <View style={{ flex: 1 }}>
                <T v="callout">{REPORT_CATEGORIES[r.category as keyof typeof REPORT_CATEGORIES] ?? r.category}</T>
                {r.caseNo ? <T v="caption" tone="faint">Case {r.caseNo}</T> : null}
              </View>
              <T v="callout" tone={r.status === "Reviewed" ? "trust" : "muted"}>{r.status}</T>
            </View>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <T v="headline">Appeals</T>
          <T tone="muted">Think we got a decision about you wrong? Someone who wasn't involved in it will review your appeal.</T>
          {appealMsg && <Banner tone={appealMsg.tone}>{appealMsg.text}</Banner>}
          {appeals.data?.appeals.map((a) => (
            <View key={a.caseNo} style={{ backgroundColor: c.surface, borderRadius: 16, padding: 14, gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <T v="callout" style={{ flex: 1 }}>{appeals.data!.kinds[a.kind] ?? a.kind}</T>
                <T v="callout" tone={a.status === "OVERTURNED" ? "trust" : "muted"}>{a.status === "OPEN" ? "Under review" : a.status === "OVERTURNED" ? "Decision reversed" : "Decision kept"}</T>
              </View>
              <T v="caption" tone="faint">Case {a.caseNo}</T>
              {a.decision ? <T v="caption" tone="muted">{a.decision}</T> : null}
            </View>
          ))}
          {!appealOpen ? <Button title="Appeal a decision" v="outline" onPress={() => setAppealOpen(true)} /> : (
            <View style={{ backgroundColor: c.surface, borderRadius: 18, padding: 14, gap: 10 }}>
              <T v="callout" strong>What are you appealing?</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(appeals.data?.kinds ?? {}).filter(([k]) => k !== "BAN").map(([k, label]) => <Chip key={k} label={label} selected={appeal.kind === k} onPress={() => setAppeal({ ...appeal, kind: k })} />)}
              </View>
              <TextInput value={appeal.details} onChangeText={(t) => setAppeal({ ...appeal, details: t })} multiline maxLength={4000} accessibilityLabel="Why the decision was wrong"
                placeholder="Tell us why you think the decision was wrong (at least a couple of sentences)." placeholderTextColor={c.faint}
                style={{ minHeight: 90, borderRadius: 14, backgroundColor: c.raised, padding: 12, fontSize: 16, color: c.text, fontFamily: "Figtree_500Medium", textAlignVertical: "top" }} />
              <Button title="Send appeal" disabled={appeal.details.trim().length < 20} onPress={sendAppeal} />
            </View>
          )}
        </View>

        <View style={{ gap: 8 }}>
          <T v="headline">Blocked</T>
          {!blocks.data?.blocked.length ? <T tone="muted">You haven't blocked anyone.</T> : blocks.data.blocked.map((b) => (
            <View key={b.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderRadius: 16, paddingLeft: 14 }}>
              <T style={{ flex: 1 }}>{b.firstName}</T>
              <Pressable accessibilityRole="button" onPress={async () => { await api(`/api/blocks?userId=${b.id}`, { method: "DELETE" }); blocks.refetch(); }} style={{ padding: 14 }}>
                <T v="callout" tone="brand">Unblock</T>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <T v="headline">Emergency numbers</T>
          <Banner tone="warn">If you're in danger, contact local emergency services first.</Banner>
          {HELPLINES.map(([country, n]) => (
            <View key={country} style={{ flexDirection: "row", gap: 12, paddingVertical: 4 }}>
              <T v="callout" strong style={{ width: 90 }}>{country}</T><T v="callout" tone="muted" style={{ flex: 1 }}>{n}</T>
            </View>
          ))}
        </View>
        <Button title="Privacy settings" v="outline" icon="lock" onPress={() => router.push("/settings")} />
      </ScrollView>
    </Screen>
  );
}
