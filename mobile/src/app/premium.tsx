import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Sunset } from "@/components/Ambient";
import { Button, IconButton } from "@/components/Button";
import { Icon, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, ErrorState, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { money, niceDate, per } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import type { Catalogue, Quote } from "@/lib/types";
import { dusk } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

// Only benefits that exist today. Boosts and travel mode are marked as coming soon.
const BENEFITS: [IconName, string, string, boolean?][] = [
  ["likes", "See who likes you", "Match the moment you like them back."],
  ["sparkle", "More likes every day", "100 a day on Premium, unlimited on Premium Plus."],
  ["star", "More priority likes", "Lead with a note that lands at the top."],
  ["sliders", "Advanced filters", "Fine-tune who you see."],
  ["eye", "Incognito (Premium Plus)", "Only people you like can see you."],
  ["pin", "Profile boost & travel mode", "Coming soon.", true],
];

const TRUST: [string, string][] = [
  ["🔒", "Secure payment — card and UPI details stay with the gateway"],
  ["📄", "Clear terms before you pay"],
  ["❌", "Cancel any time in two taps"],
  ["🧾", "An invoice for every payment"],
];

/** Calm, transparent upsell: real benefits, the price today and the price after, nothing pre-ticked. */
export default function Premium() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["catalogue"], queryFn: () => api<Catalogue>("/api/billing/catalogue") });
  const [choice, setChoice] = useState<string | null>(null); // plan code or "pass:<offerId>"
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState<{ plan: string; quote: Quote } | null>(null);
  const [codeErr, setCodeErr] = useState("");
  const [checking, setChecking] = useState(false);

  const plans = q.data?.plans ?? [];
  const featured = plans.find((p) => p.quote.offer) ?? plans[0];
  useEffect(() => { if (featured && !choice) setChoice(featured.code); }, [featured?.code]);
  const sub = q.data?.subscription;
  const subscribed = !!sub && !["NONE", "REWARD", "EXPIRED"].includes(sub.status);
  const iosBlocked = Platform.OS === "ios" && q.data?.provider === "RAZORPAY" && !q.data.appleIap.enabled;

  const selected: Quote | null = useMemo(() => {
    if (!choice) return null;
    if (choice.startsWith("pass:")) return q.data?.passes.find((p) => p.offer?.id === choice.slice(5)) ?? null;
    if (coupon && coupon.plan === choice) return coupon.quote;
    return plans.find((p) => p.code === choice)?.quote ?? null;
  }, [choice, coupon, q.data]);

  async function applyCode() {
    if (!choice || choice.startsWith("pass:") || !code.trim()) return;
    setChecking(true); setCodeErr("");
    try {
      const r = await api<{ quote: Quote }>("/api/billing/quote", { body: { planCode: choice, coupon: code.trim() } });
      if (r.quote.couponError) { setCodeErr(r.quote.couponError); setCoupon(null); haptic.warning(); }
      else { setCoupon({ plan: choice, quote: r.quote }); haptic.success(); }
    } catch (e: any) { setCodeErr(e.message); } finally { setChecking(false); }
  }

  function next() {
    if (!selected || !choice) return;
    haptic.light();
    router.push({ pathname: "/checkout", params: { plan: selected.planCode, offerId: choice.startsWith("pass:") ? choice.slice(5) : "", coupon: coupon?.plan === choice ? coupon.quote.coupon?.code ?? "" : "" } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 170 }}>
        <LinearGradient colors={[...dusk]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 30, gap: 10, overflow: "hidden" }}>
          <Aurora variant="match" style={{ opacity: 0.45 }} />
          <IconButton icon="close" label="Close" tone="glass" size={44} onPress={() => router.back()} />
          <T v="display" tone="white" style={{ fontSize: 36, lineHeight: 40 }}>Find better connections</T>
          <T tone="white" style={{ opacity: 0.85 }}>Everything you need to meet someone stays free. Premium adds reach and control.</T>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, marginTop: -18, gap: 14 }}>
          {q.isLoading && <Skeleton h={180} r={26} />}
          {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}

          {subscribed && sub && (
            <Animated.View entering={FadeInDown} style={{ backgroundColor: c.surface, borderRadius: 26, padding: 18, gap: 8, borderWidth: 1, borderColor: c.line }}>
              <T v="caption" tone="muted">Your plan</T>
              <T v="title">{sub.planName}</T>
              <T tone="muted">{sub.renews && sub.nextChargeAt ? `Next payment ${money(sub.nextChargeMinor ?? 0, sub.currency)} on ${niceDate(sub.nextChargeAt)}.` : `On until ${niceDate(sub.endsAt)}. It won't renew.`}</T>
              <Button title="Manage subscription" v="outline" icon="card" onPress={() => router.push("/subscription")} />
            </Animated.View>
          )}

          {!subscribed && featured?.quote.offer && featured.quote.offer.kind === "INTRO" && (
            <Animated.View entering={FadeInDown.duration(380)} style={{ borderRadius: 28, overflow: "hidden", shadowColor: "#F0864A", shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 8 }}>
              <Sunset style={{ padding: 20, gap: 6 }}>
                <View style={{ alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <T v="caption" tone="white" style={{ fontFamily: "Figtree_700Bold" }}>{featured.quote.offer.badge ?? "Introductory offer"}</T>
                </View>
                <T v="display" tone="white" style={{ fontSize: 40, lineHeight: 44 }}>Start for {money(featured.quote.todayMinor, featured.quote.currency)}</T>
                <T v="headline" tone="white">{featured.quote.introDays} days of {featured.name}</T>
                <T tone="white" style={{ opacity: 0.95 }}>Then {money(featured.quote.regularMinor, featured.quote.currency)}/{per(featured.quote.periodDays)} from {niceDate(featured.quote.nextChargeAt)}. Cancel before then and you won't be charged again.</T>
                {featured.quote.offer.endsAt && <T v="caption" tone="white">Offer ends {niceDate(featured.quote.offer.endsAt)}.</T>}
              </Sunset>
            </Animated.View>
          )}

          <View style={{ backgroundColor: c.surface, borderRadius: 26, padding: 18, gap: 14, borderWidth: 1, borderColor: c.line }}>
            <T v="headline">Your Premium experience includes</T>
            {BENEFITS.map(([icon, t, b, soon]) => (
              <View key={t} style={{ flexDirection: "row", gap: 12, alignItems: "center", opacity: soon ? 0.6 : 1 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.raised, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={20} color={c.brand} /></View>
                <View style={{ flex: 1 }}><T v="callout" strong>{t}</T><T v="caption" tone="muted">{b}</T></View>
              </View>
            ))}
          </View>

          {!subscribed && plans.length > 0 && (
            <>
              <T v="headline" style={{ marginTop: 6 }}>Choose a plan</T>
              {plans.map((p) => {
                const on = choice === p.code;
                const qt = coupon?.plan === p.code ? coupon.quote : p.quote;
                return (
                  <Pressable key={p.code} accessibilityRole="radio" accessibilityState={{ selected: on }}
                    accessibilityLabel={`${p.name}. ${money(qt.todayMinor, qt.currency)} today, then ${money(qt.regularMinor, qt.currency)} per ${per(qt.periodDays)}.`}
                    onPress={() => { haptic.tick(); setChoice(p.code); setCodeErr(""); }}
                    style={{ padding: 16, borderRadius: 22, backgroundColor: c.surface, borderWidth: 2, borderColor: on ? c.brand : c.line, gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.brand : c.faint, alignItems: "center", justifyContent: "center" }}>
                        {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.brand }} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <T v="headline">{p.name}</T>
                          {qt.offer && <View style={{ backgroundColor: c.accentWash, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><T v="caption" style={{ color: c.text, fontFamily: "Figtree_700Bold" }}>{qt.offer.badge ?? "Offer"}</T></View>}
                        </View>
                        <T v="caption" tone="muted">{p.features.dailyLikes < 0 ? "Unlimited likes" : `${p.features.dailyLikes} likes a day`} · {p.features.dailyPriorityLikes} priority likes{p.features.incognito ? " · incognito" : ""}</T>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <T v="headline">{money(qt.todayMinor, qt.currency)}</T>
                        <T v="caption" tone="muted">today</T>
                      </View>
                    </View>
                    <T v="caption" tone="muted" style={{ marginLeft: 34 }}>
                      {qt.introDays ? `${qt.introDays} days, then ` : qt.discountMinor ? "First month, then " : "Then "}{money(qt.regularMinor, qt.currency)}/{per(qt.periodDays)} · renews automatically · cancel any time
                    </T>
                  </Pressable>
                );
              })}

              {(q.data?.passes.length ?? 0) > 0 && <T v="headline" style={{ marginTop: 6 }}>Or just a few days</T>}
              {q.data?.passes.map((p) => {
                const key = `pass:${p.offer?.id}`;
                const on = choice === key;
                return (
                  <Pressable key={key} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { haptic.tick(); setChoice(key); }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 22, backgroundColor: c.surface, borderWidth: 2, borderColor: on ? c.brand : c.line }}>
                    <Icon name="tag" color={c.accent} />
                    <View style={{ flex: 1 }}><T v="headline">{p.offer?.headline}</T><T v="caption" tone="muted">{p.periodDays} days of Premium · one payment · never renews</T></View>
                    <T v="headline">{money(p.todayMinor, p.currency)}</T>
                  </Pressable>
                );
              })}

              {choice && !choice.startsWith("pass:") && (
                showCode ? (
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" placeholder="Coupon code" placeholderTextColor={c.faint} accessibilityLabel="Coupon code"
                        style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: c.raised, paddingHorizontal: 14, fontSize: 16, color: c.text, fontFamily: "Figtree_600SemiBold", letterSpacing: 1 }} />
                      <Button title="Apply" v="outline" loading={checking} disabled={!code.trim()} onPress={applyCode} />
                    </View>
                    {codeErr ? <T v="caption" style={{ color: c.alert }}>{codeErr}</T> : null}
                    {coupon?.plan === choice && coupon.quote.coupon && (
                      <Animated.View entering={FadeIn}><Banner tone="trust">{`${coupon.quote.coupon.code}: ${money(coupon.quote.coupon.discountMinor, coupon.quote.currency)} off today. Coupons replace the intro offer — pick whichever you prefer.`}</Banner></Animated.View>
                    )}
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => setShowCode(true)}><T v="callout" tone="brand">Have a coupon code?</T></Pressable>
                )
              )}
            </>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
            {TRUST.map(([e, t]) => (
              <View key={t} style={{ width: "47%", flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <T>{e}</T><T v="caption" tone="muted" style={{ flex: 1 }}>{t}</T>
              </View>
            ))}
          </View>
          {q.data?.provider === "MOCK" && <T v="caption" tone="faint">Test mode: payments are simulated and no money moves.</T>}
        </View>
      </ScrollView>

      {!subscribed && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16), backgroundColor: c.bg, gap: 6, borderTopWidth: 1, borderTopColor: c.line }}>
          {iosBlocked ? (
            <Banner tone="info">Subscribing on iPhone isn't available yet. You can keep using everything that's free.</Banner>
          ) : selected ? (
            <>
              <Button title={`Continue — ${money(selected.todayMinor, selected.currency)} today`} size="lg" full onPress={next} />
              <T v="caption" tone="muted" center>
                {selected.kind === "PASS" ? "One payment. Doesn't renew." : `Then ${money(selected.regularMinor, selected.currency)}/${per(selected.periodDays)}. You'll review everything before paying.`}
              </T>
            </>
          ) : null}
          <Button title="Maybe later" v="ghost" full onPress={() => router.back()} />
        </View>
      )}
    </View>
  );
}
