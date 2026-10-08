import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { REPORT_CATEGORIES } from "@shared/constants";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon, VerifiedBadge } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, Screen } from "@/components/ui";
import { api } from "@/lib/api";
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
  const reports = useQuery({ queryKey: ["my-reports"], queryFn: () => api<{ reports: { id: string; category: string; status: string; createdAt: string }[] }>("/api/reports") });
  const blocks = useQuery({ queryKey: ["blocks"], queryFn: () => api<{ blocked: { id: string; firstName: string }[] }>("/api/blocks") });
  const status = me?.user.selfieStatus;

  async function verify() {
    try { await api("/api/verification", { method: "POST" }); haptic.success(); setMsg("Thanks! We'll review your selfie shortly."); refetchMe(); }
    catch (e: any) { setMsg(e.message); }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Safety Center" sub="Tools and advice for meeting people safely." />
      <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: 32 }}>
        <View style={{ backgroundColor: c.trustWash, borderRadius: 22, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {status === "VERIFIED" ? <VerifiedBadge size={30} /> : <Icon name="shield" size={30} color={c.trust} />}
            <T v="headline" style={{ flex: 1 }}>{status === "VERIFIED" ? "You're verified" : status === "PENDING" ? "Verification under review" : "Verify your profile"}</T>
          </View>
          <T v="callout" tone="muted">{status === "VERIFIED" ? "Your profile shows the sage ring." : status === "PENDING" ? "We'll let you know as soon as it's done." : "A quick selfie check earns the sage ring and more trust from matches."}</T>
          {(status === "NONE" || status === "REJECTED") && <Button title="Verify me" onPress={verify} />}
          {msg ? <T v="callout">{msg}</T> : null}
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
              <T v="callout">{REPORT_CATEGORIES[r.category as keyof typeof REPORT_CATEGORIES]}</T>
              <T v="callout" tone={r.status === "Reviewed" ? "trust" : "muted"}>{r.status}</T>
            </View>
          ))}
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
