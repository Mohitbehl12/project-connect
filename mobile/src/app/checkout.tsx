import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, ErrorState, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { money, niceDate, per } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import type { Catalogue, Quote } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <T tone="muted">{label}</T>
      <T v={strong ? "title" : "headline"} style={strong ? { fontSize: 26 } : undefined}>{value}</T>
    </View>
  );
}

/** The last stop before paying: what you pay today, what you pay after and when, and how to stop it. */
export default function Checkout() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { plan, offerId, coupon } = useLocalSearchParams<{ plan: string; offerId?: string; coupon?: string }>();
  const q = useQuery({ queryKey: ["quote", plan, offerId, coupon], queryFn: () => api<{ quote: Quote }>("/api/billing/quote", { body: { planCode: plan, offerId: offerId || undefined, coupon: coupon || undefined } }) });
  const cat = qc.getQueryData<Catalogue>(["catalogue"]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const quote = q.data?.quote;
  const isPass = quote?.kind === "PASS";

  async function start() {
    if (!quote) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ paymentId: string; payUrl: string }>("/api/billing/checkout", {
        body: { planCode: quote.planCode, offerId: offerId || undefined, coupon: coupon || undefined, acceptTerms: true, expectedTodayMinor: quote.todayMinor, returnTo: "app" },
      });
      haptic.light();
      if (Platform.OS === "web") {
        globalThis.open?.(r.payUrl, "_blank");
      } else {
        const back = Linking.createURL("payment-result", { queryParams: { id: r.paymentId } });
        await WebBrowser.openAuthSessionAsync(r.payUrl.replace("return=app", `return=${encodeURIComponent(back)}`), back);
      }
      router.replace({ pathname: "/payment-result", params: { id: r.paymentId } });
    } catch (e: any) {
      setErr(e.message);
      if (e.code === "price_changed") q.refetch();
      haptic.warning();
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 16 }}>
        <Header title={isPass ? "Review your pass" : "Start your Premium experience"} sub="Check the details. Nothing is charged until you confirm on the next screen." />
        {q.isLoading && <Skeleton h={300} r={24} />}
        {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {quote && (
          <>
            <View style={{ backgroundColor: c.surface, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 6, borderWidth: 1, borderColor: c.line }}>
              <Row label="Today" value={money(quote.todayMinor, quote.currency)} strong />
              {quote.introDays ? <Row label="Introductory period" value={`${quote.introDays} days`} /> : null}
              {quote.coupon ? <Row label={`Coupon ${quote.coupon.code}`} value={`−${money(quote.coupon.discountMinor, quote.currency)}`} /> : null}
              {isPass ? (
                <Row label="Premium until" value={niceDate(quote.accessUntil)} />
              ) : (
                <>
                  <Row label={quote.introDays ? "After the intro" : "After the first month"} value={`${money(quote.regularMinor, quote.currency)}/${per(quote.periodDays)}`} />
                  <Row label="Next billing date" value={niceDate(quote.nextChargeAt)} />
                </>
              )}
              <View style={{ paddingVertical: 12, gap: 6 }}>
                {quote.terms.map((t) => (
                  <View key={t} style={{ flexDirection: "row", gap: 8 }}><Icon name="check" size={18} color={c.trust} /><T v="callout" style={{ flex: 1 }}>{t}</T></View>
                ))}
              </View>
            </View>

            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => { haptic.tick(); setAgree(!agree); }}
              style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 14, borderRadius: 18, backgroundColor: agree ? c.trustWash : c.raised }}>
              <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: agree ? c.trust : c.faint, backgroundColor: agree ? c.trust : "transparent", alignItems: "center", justifyContent: "center" }}>
                {agree && <Icon name="check" size={18} color="#FFF" stroke={2.6} />}
              </View>
              <T v="callout" style={{ flex: 1 }}>
                {isPass ? "I understand this is a one-off payment." : `I understand the subscription terms: it renews at ${money(quote.regularMinor, quote.currency)}/${per(quote.periodDays)} until I cancel.`}
              </T>
            </Pressable>

            <View style={{ gap: 4 }}>
              <T v="caption" tone="muted">{cat?.provider === "MOCK" ? "Test mode — you'll choose to succeed or fail; no money moves." : isPass ? "Pay with UPI, card, net banking or a wallet on Razorpay's secure page." : "Auto-renew works with UPI Autopay, cards and net banking on Razorpay's secure page. Your bank may also notify you before each charge."}</T>
              <T v="caption" tone="muted">Refunds follow our Cancellation & Refund Policy (Settings › Legal).</T>
            </View>
            {err ? <Banner tone="alert">{err}</Banner> : null}
            <Button title={isPass ? `Pay ${money(quote.todayMinor, quote.currency)}` : "Start Premium"} size="lg" full loading={busy} disabled={!agree} icon="lock" onPress={start} />
            <Button title="Back" v="ghost" full onPress={() => router.back()} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
