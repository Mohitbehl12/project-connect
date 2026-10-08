import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { DATE_KINDS } from "@shared/constants";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { Banner, Chip, Field, Screen, SheetHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";

const EMOJI: Record<string, string> = { COFFEE: "☕", MEAL: "🍽️", WALK: "🌳", ACTIVITY: "🎳", OTHER: "✨" };
const TIMES = [["Morning", 10], ["Lunch", 13], ["Afternoon", 16], ["Evening", 19]] as const;

export default function DatePlanner() {
  const { matchId, name } = useLocalSearchParams<{ matchId: string; name?: string }>();
  const qc = useQueryClient();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  const [kind, setKind] = useState("COFFEE");
  const [place, setPlace] = useState("");
  const [day, setDay] = useState(1);
  const [hour, setHour] = useState<number>(16);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const d = new Date(days[day]); d.setHours(hour, 0, 0, 0);
    setErr(""); setBusy(true);
    try {
      await api(`/api/matches/${matchId}/dates`, { body: { kind, place: place.trim(), startsAt: d.toISOString(), note: note.trim() || undefined } });
      haptic.success();
      qc.invalidateQueries({ queryKey: ["match", matchId] });
      qc.invalidateQueries({ queryKey: ["messages", matchId] });
      router.back();
    } catch (e: any) { setErr(e.message); haptic.warning(); } finally { setBusy(false); }
  }

  return (
    <Screen edges={["top", "bottom"]} pad={false}>
      <SheetHeader title={name ? `A date with ${name}` : "Suggest a date"} onClose={() => router.back()} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 22 }} keyboardShouldPersistTaps="handled">
          <Banner tone="trust">For a first meeting, pick a busy public place and plan your own way there and back.</Banner>
          <View style={{ gap: 8 }}>
            <T v="callout" tone="muted">What</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(DATE_KINDS).map(([k, l]) => <Chip key={k} label={l} emoji={EMOJI[k]} selected={kind === k} onPress={() => setKind(k)} />)}
            </View>
          </View>
          <Field label="Where" value={place} onChangeText={setPlace} placeholder="Venue and area, e.g. Blue Tokai, Champa Gali" maxLength={120} />
          <View style={{ gap: 8 }}>
            <T v="callout" tone="muted">When</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.map((d, i) => (
                <Chip key={i} label={i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", day: "numeric" })} selected={day === i} onPress={() => setDay(i)} />
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TIMES.map(([l, h]) => <Chip key={l} label={`${l} · ${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`} selected={hour === h} onPress={() => setHour(h)} />)}
            </View>
          </View>
          <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} placeholder="Their cold brew is worth it" />
          {err ? <Banner tone="alert">{err}</Banner> : null}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Button title="Send suggestion" size="lg" full loading={busy} disabled={place.trim().length < 2} onPress={send} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
