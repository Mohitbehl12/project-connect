import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { ScrollView, Share, View } from "react-native";
import { Sunset } from "@/components/Ambient";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { ErrorState, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { niceDate } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

type Overview = { code: string; link: string; rewardDays: number; monthlyCap: number; earnedDays: number; history: { id: string; name: string; joinedAt: string; status: string; label: string }[] };

/** Invite & earn: Premium days (never cash) when a friend joins and gets verified. */
export default function Referrals() {
  const { c } = useTheme();
  const q = useQuery({ queryKey: ["referrals"], queryFn: () => api<Overview>("/api/referrals") });
  const [copied, setCopied] = useState(false);
  const d = q.data;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 16 }}>
        <Header title="Invite & earn" />
        {q.isLoading && <Skeleton h={220} r={26} />}
        {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {d && (
          <>
            <View style={{ borderRadius: 28, overflow: "hidden" }}>
              <Sunset style={{ padding: 22, gap: 10 }}>
                <Icon name="gift" size={36} color="#FFF" />
                <T v="title" tone="white">Get {d.rewardDays} Premium days for every friend who joins</T>
                <T tone="white" style={{ opacity: 0.92 }}>They sign up with your code and complete selfie verification — then the days are yours.</T>
                <View style={{ marginTop: 6, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 18, padding: 14, alignItems: "center" }}>
                  <T v="caption" tone="white">Your code</T>
                  <T v="display" tone="white" style={{ letterSpacing: 4, fontSize: 32 }} selectable>{d.code}</T>
                </View>
              </Sunset>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button title="Share invite" icon="share" style={{ flex: 1 }} onPress={() => { haptic.light(); Share.share({ message: `Join me on Project Connect — use my code ${d.code} when you sign up: ${d.link}` }); }} />
              <Button title={copied ? "Copied" : "Copy code"} v="outline" icon={copied ? "check" : "copy"} style={{ flex: 1 }} onPress={async () => { await Clipboard.setStringAsync(d.code); haptic.success(); setCopied(true); setTimeout(() => setCopied(false), 1800); }} />
            </View>
            <View style={{ backgroundColor: c.surface, borderRadius: 22, padding: 16, gap: 10 }}>
              <T v="headline">How it works</T>
              {["Share your code or link with a friend.", "They create an account with your code.", `Once their selfie is verified, you get ${d.rewardDays} Premium days.`].map((t, i) => (
                <View key={t} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.raised, alignItems: "center", justifyContent: "center" }}><T v="caption" strong>{i + 1}</T></View>
                  <T v="callout" style={{ flex: 1 }}>{t}</T>
                </View>
              ))}
              <T v="caption" tone="muted">Up to {d.monthlyCap} rewards a month. Accounts made on the same device, or that look fake, don't count. If you're already paying, the days start when your plan ends.</T>
            </View>
            <View style={{ gap: 8 }}>
              <T v="headline">Your invites {d.earnedDays ? `· ${d.earnedDays} days earned` : ""}</T>
              {!d.history.length && <T tone="muted">No one yet — your first invite is one share away.</T>}
              {d.history.map((h) => (
                <View key={h.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: c.surface }}>
                  <Icon name={h.status === "REWARDED" ? "check" : h.status === "REJECTED" ? "close" : "profile"} color={h.status === "REWARDED" ? c.trust : h.status === "REJECTED" ? c.faint : c.brand} />
                  <View style={{ flex: 1 }}><T v="callout" strong>{h.name}</T><T v="caption" tone="muted">{h.label} · {niceDate(h.joinedAt)}</T></View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
