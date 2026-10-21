import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Sunset } from "@/components/Ambient";
import { Button, IconButton } from "@/components/Button";
import { Icon, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, ErrorState, Skeleton } from "@/components/ui";
import { API_URL, api } from "@/lib/api";
import { money, niceDate, per } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { onPurchaseResult } from "@/lib/purchases";
import { buyStoreProduct, loadStoreProducts, ownedStorePurchases, storeSupported, type StoreProduct } from "@/lib/store";
import type { Catalogue, Quote } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";

// Only benefits that exist today. Boosts and travel mode are marked as coming soon.
const BENEFITS: [IconName, string, string, boolean?][] = [
  ["likes", "See who likes you", "Match the moment you like them back."],
  ["sparkle", "More likes every day", "100 a day on Premium, unlimited on Premium Plus."],
  ["star", "More Super Likes ⭐", "Lead with a note that lands at the top."],
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
  const { c, g } = useTheme();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["catalogue"], queryFn: () => api<Catalogue>("/api/billing/catalogue") });
  const [choice, setChoice] = useState<string | null>(null); // plan code or "pass:<offerId>"
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState<{ plan: string; quote: Quote } | null>(null);
  const [codeErr, setCodeErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [period, setPeriod] = useState<Record<string, number>>({}); // billing period picked per plan

  const plans = q.data?.plans ?? [];
  const featured = plans.find((p) => p.quote.offer) ?? plans[0];
  useEffect(() => { if (featured && !choice) setChoice(featured.code); }, [featured?.code]);
  const sub = q.data?.subscription;
  const subscribed = !!sub && !["NONE", "REWARD", "EXPIRED"].includes(sub.status);
  const freeUntil = sub?.status === "REWARD" ? sub.endsAt : null;
  /** The quote for a plan at the billing period the person picked (monthly by default). */
  const quoteOf = (p: (typeof plans)[number]) => p.options?.find((o) => o.durationDays === period[p.code])?.quote ?? p.quote;
  // On iPhone and Android, Premium is bought through the App Store / Google Play when the server has it on.
  const storeMode = storeSupported && !!q.data?.store?.enabled;
  const storeName = Platform.OS === "ios" ? "the App Store" : "Google Play";
  const iosBlocked = Platform.OS === "ios" && !storeMode && q.data?.provider === "RAZORPAY";
  const [products, setProducts] = useState<Record<string, StoreProduct>>({});
  const [buying, setBuying] = useState(false);
  const [storeMsg, setStoreMsg] = useState<{ tone: "trust" | "alert"; text: string } | null>(null);
  const idOf = (o?: { store?: { apple: string | null; google: string | null } | null }) => (Platform.OS === "ios" ? o?.store?.apple : o?.store?.google) ?? null;
  const optionOf = (p: (typeof plans)[number]) => p.options?.find((o) => o.durationDays === (period[p.code] ?? p.quote.periodDays)) ?? p.options?.[0];
  const storeProductOf = (p: (typeof plans)[number]) => { const id = idOf(optionOf(p)); return id ? products[id] : undefined; };
  useEffect(() => {
    if (!storeMode) return;
    const ids = plans.flatMap((p) => (p.options ?? []).map(idOf)).filter((x): x is string => !!x);
    loadStoreProducts([...new Set(ids)]).then(setProducts).catch(() => setStoreMsg({ tone: "alert", text: `Couldn't load prices from ${storeName}. Check your connection.` }));
  }, [storeMode, q.data]);
  useEffect(() => onPurchaseResult((r) => {
    setBuying(false);
    if (r.ok) { setStoreMsg({ tone: "trust", text: "Premium is on. Thank you!" }); q.refetch(); }
    else setStoreMsg({ tone: "alert", text: r.message });
  }), []);

  async function buyInStore() {
    const p = plans.find((x) => x.code === choice);
    const product = p ? storeProductOf(p) : undefined;
    if (!product) { setStoreMsg({ tone: "alert", text: `This plan isn't available in ${storeName} yet.` }); return; }
    setStoreMsg(null); setBuying(true); haptic.light();
    try { await buyStoreProduct(product, { appleAccountToken: q.data?.store?.appleAccountToken, googleAccountId: q.data?.store?.googleAccountId }); }
    catch (e: any) { setBuying(false); setStoreMsg({ tone: "alert", text: e.message }); }
  }
  async function restore() {
    setStoreMsg(null); setBuying(true);
    try {
      const owned = await ownedStorePurchases();
      if (!owned.tokens.length) { setStoreMsg({ tone: "alert", text: `No subscriptions found for this ${Platform.OS === "ios" ? "Apple ID" : "Google account"}.` }); return; }
      const r = await api<{ restored: number; message: string }>("/api/billing/store/restore", { body: { platform: owned.platform, tokens: owned.tokens } });
      if (r.restored) await owned.finishAll();
      setStoreMsg({ tone: r.restored ? "trust" : "alert", text: r.message }); q.refetch();
    } catch (e: any) { setStoreMsg({ tone: "alert", text: e.message }); } finally { setBuying(false); }
  }

  const selected: Quote | null = useMemo(() => {
    if (!choice) return null;
    if (choice.startsWith("pass:")) return q.data?.passes.find((p) => p.offer?.id === choice.slice(5)) ?? null;
    if (coupon && coupon.plan === choice) return coupon.quote;
    const p = plans.find((x) => x.code === choice);
    return p ? quoteOf(p) : null;
  }, [choice, coupon, q.data, period]);

  async function applyCode() {
    if (!choice || choice.startsWith("pass:") || !code.trim()) return;
    setChecking(true); setCodeErr("");
    try {
      const r = await api<{ quote: Quote }>("/api/billing/quote", { body: { planCode: choice, coupon: code.trim(), durationDays: period[choice] ?? undefined } });
      if (r.quote.couponError) { setCodeErr(r.quote.couponError); setCoupon(null); haptic.warning(); }
      else { setCoupon({ plan: choice, quote: r.quote }); haptic.success(); }
    } catch (e: any) { setCodeErr(e.message); } finally { setChecking(false); }
  }

  function next() {
    if (!selected || !choice) return;
    haptic.light();
    router.push({ pathname: "/checkout", params: { plan: selected.planCode, offerId: choice.startsWith("pass:") ? choice.slice(5) : "", coupon: coupon?.plan === choice ? coupon.quote.coupon?.code ?? "" : "", duration: choice.startsWith("pass:") ? "" : String(selected.periodDays) } });
  }

  if (q.data?.freeForever) return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LinearGradient colors={[...g.dusk]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 30, gap: 10, overflow: "hidden" }}>
        <Aurora variant="match" style={{ opacity: 0.45 }} />
        <IconButton icon="close" label="Close" tone="glass" size={44} onPress={() => router.back()} />
        <T v="display" tone="white" style={{ fontSize: 34, lineHeight: 38 }}>Everything is free for you, forever</T>
        <T tone="white" style={{ opacity: 0.9 }}>Every feature is included — no subscription, no payment details, nothing that renews.</T>
      </LinearGradient>
      <View style={{ padding: 20, gap: 10 }}>
        {["See who likes you", "Unlimited likes and Priority Likes", "Boosts and advanced filters", "Photos, voice messages and calls"].map((f) => (
          <View key={f} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><Icon name="check" color={c.trust} /><T>{f}</T></View>
        ))}
      </View>
    </View>
  );

  const ms = q.data?.membership;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 170 }}>
        <LinearGradient colors={[...g.dusk]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 30, gap: 10, overflow: "hidden" }}>
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

          {freeUntil && (
            <Animated.View entering={FadeInDown} style={{ backgroundColor: c.surface, borderRadius: 26, padding: 18, gap: 6, borderWidth: 2, borderColor: c.brand }}>
              <T v="caption" tone="brand" style={{ fontFamily: "Figtree_700Bold" }}>{ms?.state === "FREE_TRIAL" ? "🎁 Free trial" : "🎁 Your gift"}</T>
              <T v="title">{ms?.state === "FREE_TRIAL" ? `Your free trial ends on ${niceDate(freeUntil)}` : `Premium is free until ${niceDate(freeUntil)}`}</T>
              {ms?.price ? <T strong>After that: Membership {ms.price}</T> : null}
              <T tone="muted">Nothing to pay now and nothing is charged automatically. To keep your membership after that, pick a plan below — you'll see the full price before paying. A plan you choose starts the day you pay.</T>
            </Animated.View>
          )}

          {!subscribed && !freeUntil && !storeMode && featured?.quote.offer && featured.quote.offer.kind === "INTRO" && (
            <Animated.View entering={FadeInDown.duration(380)} style={{ borderRadius: 28, overflow: "hidden", shadowColor: g.sunset[1], shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 8 }}>
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
                const qt = coupon?.plan === p.code ? coupon.quote : quoteOf(p);
                const opts = p.options ?? [];
                const monthly = opts.find((o) => o.durationDays <= 31);
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
                        <T v="headline">{storeMode ? storeProductOf(p)?.displayPrice ?? money(qt.regularMinor, qt.currency) : money(qt.todayMinor, qt.currency)}</T>
                        <T v="caption" tone="muted">{storeMode ? `per ${per(qt.periodDays)}` : "today"}</T>
                      </View>
                    </View>
                    <T v="caption" tone="muted" style={{ marginLeft: 34 }}>
                      {storeMode ? `Billed by ${storeName} · renews every ${per(qt.periodDays)} · cancel any time in your ${storeName} subscriptions` : <>{qt.introDays ? `${qt.introDays} days, then ` : qt.discountMinor ? `First ${per(qt.periodDays)}, then ` : "Then "}{money(qt.regularMinor, qt.currency)}/{per(qt.periodDays)} · renews automatically · cancel any time</>}
                    </T>
                    {opts.length > 1 && (
                      <View accessibilityRole="radiogroup" accessibilityLabel={`${p.name} billing period`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, marginLeft: 34 }}>
                        {opts.map((o) => {
                          const picked = (period[p.code] ?? qt.periodDays) === o.durationDays;
                          const save = monthly && o.durationDays > 31 ? Math.round((1 - o.perMonthMinor / monthly.perMonthMinor) * 100) : 0;
                          return (
                            <Pressable key={o.durationDays} accessibilityRole="radio" accessibilityState={{ selected: picked }}
                              accessibilityLabel={`${o.label}, ${money(o.quote.regularMinor, o.quote.currency)}${save > 0 ? `, save ${save} percent` : ""}`}
                              onPress={() => { haptic.tick(); setChoice(p.code); setCoupon(null); setCodeErr(""); setPeriod({ ...period, [p.code]: o.durationDays }); }}
                              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1.5, borderColor: picked ? c.brand : c.line, backgroundColor: picked ? c.brandWash : c.raised, minWidth: 84 }}>
                              <T v="caption" strong>{o.label}</T>
                              <T v="callout" strong>{(storeMode && products[idOf(o) ?? ""]?.displayPrice) || money(o.quote.regularMinor, o.quote.currency)}</T>
                              {o.durationDays > 31 && <T v="caption" tone="muted">{money(o.perMonthMinor, o.quote.currency)}/month</T>}
                              {save > 0 && <T v="caption" tone="brand" style={{ fontFamily: "Figtree_700Bold" }}>Save {save}%</T>}
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </Pressable>
                );
              })}

              {!storeMode && (q.data?.passes.length ?? 0) > 0 && <T v="headline" style={{ marginTop: 6 }}>Or just a few days</T>}
              {!storeMode && q.data?.passes.map((p) => {
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

              {!storeMode && choice && !choice.startsWith("pass:") && (
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
          {storeMsg && <Banner tone={storeMsg.tone}>{storeMsg.text}</Banner>}
          {storeMode && selected ? (
            <>
              <Button title={buying ? "Waiting for the store…" : `Continue — ${plans.find((x) => x.code === choice) && storeProductOf(plans.find((x) => x.code === choice)!)?.displayPrice || money(selected.regularMinor, selected.currency)}`} size="lg" full loading={buying} onPress={buyInStore} />
              <T v="caption" tone="muted" center>Renews every {per(selected.periodDays)} until you cancel in your {storeName} subscriptions, at least 24 hours before renewal.</T>
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
                <Pressable accessibilityRole="button" onPress={restore} disabled={buying}><T v="caption" tone="brand" strong>Restore purchases</T></Pressable>
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${API_URL}/legal/terms`)}><T v="caption" tone="brand">Terms</T></Pressable>
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${API_URL}/legal/privacy`)}><T v="caption" tone="brand">Privacy</T></Pressable>
              </View>
            </>
          ) : iosBlocked ? (
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
