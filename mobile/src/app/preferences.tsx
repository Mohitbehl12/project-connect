import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Switch, View } from "react-native";
import { CITIES, GENDERS, INTENTS } from "@shared/constants";
import { Button, IconButton } from "@/components/Button";
import { Header } from "@/components/Header";
import { T } from "@/components/Text";
import { Banner, Chip, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const DISTANCES = [10, 25, 50, 100, 300];

export default function Preferences() {
  const { me, refetchMe } = useAuth();
  const { c } = useTheme();
  const qc = useQueryClient();
  const p = me?.preferences;
  const [showMe, setShowMe] = useState<string[]>(p?.interestedIn ? p.interestedIn.split(",").filter(Boolean) : []);
  const [ageMin, setAgeMin] = useState(p?.ageMin ?? 22);
  const [ageMax, setAgeMax] = useState(p?.ageMax ?? 35);
  const [distance, setDistance] = useState(p?.maxDistanceKm ?? 50);
  const [longDistance, setLongDistance] = useState(!!p?.longDistance);
  const [intents, setIntents] = useState<string[]>(p?.intents ? p.intents.split(",").filter(Boolean) : []);
  const [err, setErr] = useState("");
  const travelOn = !!p?.travelCity && !!p.travelUntil && new Date(p.travelUntil) > new Date();
  const [travelMsg, setTravelMsg] = useState("");
  async function travel(city: string | null) {
    setTravelMsg("");
    try {
      await api("/api/travel", { method: "PUT", body: { city, days: 7 } });
      haptic.success(); await refetchMe(); qc.invalidateQueries({ queryKey: ["discovery"] });
      setTravelMsg(city ? `You're visiting ${city} for 7 days ✈️ People there can see you as "Visiting ${city}".` : "Travel mode is off. You're back home.");
    } catch (e: any) {
      setTravelMsg(e.code === "upgrade_required" ? "Travel mode is part of Premium Plus." : e.message);
      if (e.code === "upgrade_required") router.push("/premium");
    }
  }
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr(""); setBusy(true);
    try {
      await api("/api/preferences", { method: "PUT", body: { interestedIn: showMe, ageMin, ageMax, maxDistanceKm: distance, longDistance, intents } });
      haptic.success();
      await refetchMe();
      qc.invalidateQueries({ queryKey: ["discovery"] });
      router.back();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const step = (v: number, d: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v + d));

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Discovery preferences" sub="We only show you people who'd also want to see you." />
      <ScrollView contentContainerStyle={{ gap: 24, paddingBottom: 24 }}>
        <View style={{ gap: 8 }}>
          <T v="callout" tone="muted">Show me</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(GENDERS).map(([k, l]) => <Chip key={k} label={l} selected={showMe.includes(k)} onPress={() => setShowMe(showMe.includes(k) ? showMe.filter((x) => x !== k) : [...showMe, k])} />)}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <T v="callout" tone="muted">Age range</T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surface, borderRadius: 20, padding: 12 }}>
            <IconButton icon="minus" label="Lower minimum age" size={40} onPress={() => setAgeMin(step(ageMin, -1, 18, ageMax))} />
            <IconButton icon="plus" label="Raise minimum age" size={40} onPress={() => setAgeMin(step(ageMin, 1, 18, ageMax))} />
            <T v="title" center style={{ flex: 1 }}>{ageMin} – {ageMax}</T>
            <IconButton icon="minus" label="Lower maximum age" size={40} onPress={() => setAgeMax(step(ageMax, -1, ageMin, 99))} />
            <IconButton icon="plus" label="Raise maximum age" size={40} onPress={() => setAgeMax(step(ageMax, 1, ageMin, 99))} />
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <T v="callout" tone="muted">Distance</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {DISTANCES.map((d) => <Chip key={d} label={d >= 300 ? "300+ km" : `${d} km`} selected={distance === d} onPress={() => setDistance(d)} />)}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderRadius: 18, padding: 14 }}>
            <View style={{ flex: 1 }}>
              <T v="headline" style={{ fontFamily: "Figtree_600SemiBold" }}>Open to long distance</T>
              <T v="caption" tone="muted">Also see people further away who are open to it too.</T>
            </View>
            <Switch value={longDistance} onValueChange={(v) => { haptic.tick(); setLongDistance(v); }} trackColor={{ true: c.trust, false: c.line }} accessibilityLabel="Open to long distance" />
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <T v="callout" tone="muted">Only people looking for (leave empty for everyone)</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(INTENTS).map(([k, l]) => <Chip key={k} label={l} selected={intents.includes(k)} onPress={() => setIntents(intents.includes(k) ? intents.filter((x) => x !== k) : [...intents, k])} />)}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <T v="callout" tone="muted">Travel mode ✈️</T>
          <T v="caption" tone="muted">{travelOn ? `Visiting ${p?.travelCity} until ${new Date(p!.travelUntil!).toLocaleDateString()}. Your home city stays on your profile.` : "Going somewhere? Meet people there before you arrive — for up to 7 days."}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {travelOn && <Chip label="Back home" selected={false} onPress={() => travel(null)} />}
            {Object.keys(CITIES).filter((k) => k !== me?.profile?.city).map((k) => <Chip key={k} small label={k} selected={p?.travelCity === k && travelOn} onPress={() => travel(k)} />)}
          </View>
          {travelMsg ? <Banner tone="info">{travelMsg}</Banner> : null}
        </View>
        {err ? <Banner tone="alert">{err}</Banner> : null}
      </ScrollView>
      <Button title="Save" size="lg" full loading={busy} disabled={!showMe.length} onPress={save} />
    </Screen>
  );
}
