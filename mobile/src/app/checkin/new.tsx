import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, View } from "react-native";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { Banner, Chip, Field, Screen, SheetHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

// Date check-in: tell someone you trust, and we'll check on you after the date.
const TIMES = [["Morning", 10], ["Lunch", 13], ["Afternoon", 16], ["Evening", 19], ["Late", 21]] as const;
const AFTER = [[1, "1 hour"], [2, "2 hours"], [3, "3 hours"], [4, "4 hours"]] as const;
const GRACE = [15, 30, 60] as const;

export default function NewCheckin() {
  const p = useLocalSearchParams<{ matchId?: string; datePlanId?: string; place?: string; startsAt?: string }>();
  const { c } = useTheme();
  const qc = useQueryClient();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  const given = p.startsAt ? new Date(p.startsAt) : null;
  const [place, setPlace] = useState(p.place ?? "");
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState<number>(19);
  const [after, setAfter] = useState<number>(2);
  const [grace, setGrace] = useState<number>(30);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; share: string } | null>(null);

  const start = () => { if (given) return given; const d = new Date(days[day]); d.setHours(hour, 0, 0, 0); return d; };

  async function save() {
    const s = start();
    setErr(""); setBusy(true);
    try {
      const r = await api<{ checkin: { id: string }; share: string }>("/api/safety/checkins", {
        body: { matchId: p.matchId || undefined, datePlanId: p.datePlanId || undefined, place: place.trim(), startsAt: s.toISOString(), checkInAt: new Date(s.getTime() + after * 3600_000).toISOString(),
          graceMinutes: grace, contactName: contactName.trim(), contactEmail: contactEmail.trim(), contactAgreed: agreed, tellContactNow: true },
      });
      haptic.success();
      qc.invalidateQueries({ queryKey: ["checkins"] });
      setDone({ id: r.checkin.id, share: r.share });
    } catch (e: any) { setErr(e.message); haptic.warning(); } finally { setBusy(false); }
  }

  if (done) return (
    <Screen edges={["top", "bottom"]} pad={false}>
      <SheetHeader title="Check-in set" onClose={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Banner tone="trust">{`We've emailed ${contactName.trim()}. At ${new Date(start().getTime() + after * 3600_000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} we'll ask if you're OK. If you don't answer within ${grace} minutes, we'll email them.`}</Banner>
        <T v="callout" tone="muted">Want them to have it on WhatsApp or SMS too? Send it yourself:</T>
        <View style={{ padding: 14, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}><T selectable>{done.share}</T></View>
        <Button title="Share with my contact" icon="share" onPress={() => Share.share({ message: done.share }).catch(() => {})} />
        <Button title="Done" v="outline" onPress={() => router.replace({ pathname: "/checkin/[id]", params: { id: done.id } })} />
      </ScrollView>
    </Screen>
  );

  return (
    <Screen edges={["top", "bottom"]} pad={false}>
      <SheetHeader title="Date safety check-in" onClose={() => router.back()} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
          <T tone="muted">Tell someone you trust where you'll be. After the date we'll ask if you're OK — if you don't answer, we'll let them know so they can reach you. We never contact emergency services, and we never tell your contact who you're meeting.</T>
          <Field label="Where" value={place} onChangeText={setPlace} placeholder="Venue and area" maxLength={120} />
          {given ? (
            <T v="callout">Starts {given.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</T>
          ) : (
            <View style={{ gap: 8 }}>
              <T v="callout" tone="muted">When it starts</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {days.map((d, i) => <Chip key={i} label={i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", day: "numeric" })} selected={day === i} onPress={() => setDay(i)} />)}
              </ScrollView>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {TIMES.map(([l, h]) => <Chip key={l} label={`${l} · ${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`} selected={hour === h} onPress={() => setHour(h)} />)}
              </View>
            </View>
          )}
          <View style={{ gap: 8 }}>
            <T v="callout" tone="muted">Check on me after</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{AFTER.map(([h, l]) => <Chip key={h} label={l} selected={after === h} onPress={() => setAfter(h)} />)}</View>
          </View>
          <View style={{ gap: 8 }}>
            <T v="callout" tone="muted">If I don't answer, tell my contact after</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{GRACE.map((m) => <Chip key={m} label={`${m} minutes`} selected={grace === m} onPress={() => setGrace(m)} />)}</View>
          </View>
          <Field label="Trusted contact's name" value={contactName} onChangeText={setContactName} placeholder="e.g. Priya (sister)" maxLength={60} />
          <Field label="Their email" value={contactEmail} onChangeText={setContactEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={200}
            hint="We email them now and only again if you don't check in. We delete it a week after the date." />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} onPress={() => setAgreed(!agreed)} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: agreed ? c.brand : c.line, backgroundColor: agreed ? c.brand : "transparent", alignItems: "center", justifyContent: "center" }}>
              {agreed && <T v="caption" strong style={{ color: c.brandText }}>✓</T>}
            </View>
            <T v="callout" style={{ flex: 1 }}>{contactName.trim() || "My contact"} knows I'm adding them as my safety contact.</T>
          </Pressable>
          {!!err && <Banner tone="alert">{err}</Banner>}
          <Button title={busy ? "Setting up…" : "Set check-in"} disabled={busy || !place.trim() || !contactName.trim() || !contactEmail.includes("@") || !agreed} onPress={save} />
          <T v="caption" tone="faint" center>In danger now? Call 112 (India) or your local emergency number.</T>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
