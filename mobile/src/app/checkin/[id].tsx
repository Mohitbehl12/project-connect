import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/Button";
import { FeedbackAsk } from "@/components/FeedbackAsk";
import { T } from "@/components/Text";
import { Banner, ErrorState, Screen, SheetHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";

type Checkin = { id: string; place: string; startsAt: string; checkInAt: string; graceMinutes: number; contactName: string; status: string };

export default function CheckinStatus() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["checkins"], queryFn: () => api<{ checkins: Checkin[] }>("/api/safety/checkins") });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const c = q.data?.checkins.find((x) => x.id === id);
  async function act(action: "safe" | "extend" | "cancel", minutes?: number) {
    setErr(""); setBusy(true);
    try { await api(`/api/safety/checkins/${id}`, { body: { action, minutes } }); haptic.success(); await qc.invalidateQueries({ queryKey: ["checkins"] }); }
    catch (e: any) { setErr(e.message); haptic.warning(); } finally { setBusy(false); }
  }
  const t = (d: string) => new Date(d).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <Screen edges={["top", "bottom"]} pad={false}>
      <SheetHeader title="Date check-in" onClose={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/messages"))} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {q.error ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /> : !q.data ? <Skeleton h={120} /> : !c ? (
          <T tone="muted">This check-in has finished.</T>
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <T v="title">{c.place}</T>
              <T tone="muted">Started {t(c.startsAt)} · check-in {t(c.checkInAt)}</T>
              <T tone="muted">Safety contact: {c.contactName}</T>
            </View>
            {c.status === "SAFE" && <><Banner tone="trust">You checked in. Glad you're safe. 💛</Banner><FeedbackAsk context="CHECKIN" question="Did the check-in help you feel safer?" /></>}
            {c.status === "CANCELLED" && <Banner tone="info">You cancelled this check-in.</Banner>}
            {c.status === "ASKED" && <Banner tone="warn">{`Are you OK? Tap "I'm safe" — otherwise we'll email ${c.contactName} ${c.graceMinutes} minutes after we asked.`}</Banner>}
            {c.status === "ALERTED" && <Banner tone="alert">{`We emailed ${c.contactName} because you didn't check in. Tap "I'm safe" and we'll tell them you're OK.`}</Banner>}
            {c.status === "SCHEDULED" && <Banner tone="info">{`We'll ask if you're OK at ${new Date(c.checkInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`}</Banner>}
            {!!err && <Banner tone="alert">{err}</Banner>}
            {["SCHEDULED", "ASKED", "ALERTED"].includes(c.status) && (
              <View style={{ gap: 10 }}>
                <Button title="I'm safe" size="lg" full disabled={busy} onPress={() => act("safe")} />
                {c.status !== "ALERTED" && <Button title="I need 30 more minutes" v="outline" full disabled={busy} onPress={() => act("extend", 30)} />}
                {c.status !== "ALERTED" && <Button title="I need an hour more" v="outline" full disabled={busy} onPress={() => act("extend", 60)} />}
                <Button title="Cancel check-in" v="ghost" full disabled={busy} onPress={() => act("cancel")} />
              </View>
            )}
            <T v="caption" tone="faint" center>In danger now? Call 112 (India) or your local emergency number.</T>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
