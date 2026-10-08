import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, IconButton } from "@/components/Button";
import { Icon, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { dusk } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

type Plan = { code: string; name: string; features: Record<string, any>; price: { id: string; currency: string; amountMinor: number; durationDays: number } | null };

const FEATURES: [IconName, string, string, boolean?][] = [
  ["likes", "See who likes you", "Match instantly with people already into you."],
  ["star", "More priority likes", "Lead with a note, up to 10 a day."],
  ["sliders", "Advanced filters", "Fine-tune who you see."],
  ["sparkle", "Profile boost", "Be shown to more people nearby for a while.", true],
  ["eye", "Incognito", "Only people you like can see you."],
  ["pin", "Travel mode", "Meet people before you land.", true],
];

function money(minor: number, currency: string) {
  const v = currency === "JPY" ? minor : minor / 100;
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v);
}

/** Calm upsell: benefits first, a visible "Maybe later", nothing pre-selected, free stays fully usable. */
export default function Premium() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { me, refetchMe } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["plans"], queryFn: () => api<{ current: { code: string }; plans: Plan[] }>("/api/plans") });
  const [choice, setChoice] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "trust" | "alert"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const paid = (q.data?.plans ?? []).filter((p) => p.price);

  async function buy() {
    const plan = paid.find((p) => p.code === choice);
    if (!plan?.price) return;
    setBusy(true); setMsg(null);
    try {
      await api("/api/subscriptions", { body: { action: "subscribe", priceId: plan.price.id } });
      haptic.success();
      await refetchMe();
      qc.invalidateQueries({ queryKey: ["likes"] });
      setMsg({ tone: "trust", text: `${plan.name} is active. Enjoy!` });
    } catch (e: any) { setMsg({ tone: "alert", text: e.message }); } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <LinearGradient colors={[...dusk]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 28, gap: 10 }}>
          <IconButton icon="close" label="Close" tone="glass" size={44} onPress={() => router.back()} />
          <Icon name="sparkle" size={40} color="#F5B656" />
          <T v="display" tone="white">Upgrade to Premium</T>
          <T tone="white" style={{ opacity: 0.85 }}>More reach and more control. Everything you need to meet someone stays free.</T>
        </LinearGradient>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, padding: 20 }}>
          {FEATURES.map(([icon, t, b, soon]) => (
            <View key={t} style={{ width: 168, backgroundColor: c.surface, borderRadius: 22, padding: 16, gap: 8 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.raised, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={22} color={c.brand} /></View>
              <T v="callout" strong>{t}</T>
              <T v="caption" tone="muted">{b}</T>
              {soon && <T v="caption" tone="accent" strong>Coming soon</T>}
            </View>
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          {paid.map((p) => {
            const on = choice === p.code;
            const current = q.data?.current.code === p.code;
            return (
              <Pressable key={p.code} accessibilityRole="radio" accessibilityState={{ selected: on }} disabled={current}
                onPress={() => { haptic.tick(); setChoice(p.code); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, backgroundColor: c.surface, borderWidth: 2, borderColor: on ? c.brand : "transparent", opacity: current ? 0.6 : 1 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.brand : c.line, alignItems: "center", justifyContent: "center" }}>
                  {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.brand }} />}
                </View>
                <View style={{ flex: 1 }}>
                  <T v="headline">{p.name}{current ? " · current" : ""}</T>
                  <T v="caption" tone="muted">{p.features.dailyLikes < 0 ? "Unlimited likes" : `${p.features.dailyLikes} likes a day`} · {p.features.seeWhoLiked ? "see who likes you" : ""}{p.features.incognito ? " · incognito" : ""}</T>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <T v="headline">{money(p.price!.amountMinor, p.price!.currency)}</T>
                  <T v="caption" tone="muted">per {p.price!.durationDays} days</T>
                </View>
              </Pressable>
            );
          })}
          {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
          <T v="caption" tone="faint">Test build: purchases activate instantly without charging. Store releases use App Store and Google Play billing. You're on {me?.user.planCode.replace("_", " ").toLowerCase()}.</T>
        </View>
      </ScrollView>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: Math.max(insets.bottom, 16), backgroundColor: c.bg, gap: 6 }}>
        <Button title={choice ? `Continue with ${paid.find((p) => p.code === choice)?.name}` : "Choose a plan"} size="lg" full loading={busy} disabled={!choice} onPress={buy} />
        <Button title="Maybe later" v="ghost" full onPress={() => router.back()} />
      </View>
    </View>
  );
}
