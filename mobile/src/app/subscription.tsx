import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, EmptyState, ErrorState, Screen, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, niceDate, per } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import type { Catalogue, PaymentRow, SubSummary } from "@/lib/types";
import { openStoreSubscriptions } from "@/lib/store";
import { useTheme } from "@/theme/ThemeProvider";

const STATUS: Record<string, [string, "trust" | "warn" | "alert" | "info"]> = {
  TRIALING: ["Intro period", "trust"], ACTIVE: ["Active", "trust"], PAST_DUE: ["Payment problem", "alert"], CANCELLED: ["Won't renew", "warn"], REWARD: ["Reward days", "trust"],
};

/** My Subscription: plan, status, the exact next charge, and easy, transparent cancellation. */
export default function Subscription() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { me, refetchMe } = useAuth();
  const forever = me?.membership?.state === "FREE_FOREVER";
  const q = useQuery({ queryKey: ["subscription"], queryFn: () => api<{ subscription: SubSummary; payments: PaymentRow[] }>("/api/billing/subscription") });
  const cat = useQuery({ queryKey: ["catalogue"], queryFn: () => api<Catalogue>("/api/billing/catalogue") });
  const [sheet, setSheet] = useState<"cancel" | "change" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "trust" | "alert"; text: string } | null>(null);
  const s = q.data?.subscription;

  async function act(body: object, done: string) {
    setBusy(true); setMsg(null);
    try {
      await api("/api/billing/subscription", { body });
      haptic.success(); setMsg({ tone: "trust", text: done }); setSheet(null);
      q.refetch(); qc.invalidateQueries({ queryKey: ["catalogue"] }); refetchMe();
    } catch (e: any) { setMsg({ tone: "alert", text: e.message }); } finally { setBusy(false); }
  }
  async function invoice(id: string) {
    try { const r = await api<{ url: string }>(`/api/billing/invoices/${id}?link=1`); await WebBrowser.openBrowserAsync(r.url); }
    catch (e: any) { setMsg({ tone: "alert", text: e.message }); }
  }

  const st = s ? STATUS[s.status] : null;
  const store = s?.provider === "APPLE" ? "the App Store" : s?.provider === "GOOGLE" ? "Google Play" : null;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 16 }}>
        <Header title="My subscription" />
        {q.isLoading && <Skeleton h={200} r={24} />}
        {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        {s && (s.status === "NONE" ? (
          <EmptyState art="door" title="You're on the free plan" body={s.bankedDays ? `You have ${s.bankedDays} reward days saved.` : "Everything you need to meet someone is free. Premium adds reach and control."} action={{ label: "See Premium", onPress: () => router.push("/premium") }} />
        ) : (
          <View style={{ backgroundColor: c.surface, borderRadius: 26, padding: 20, gap: 12, borderWidth: 1, borderColor: c.line }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View><T v="caption" tone="muted">Plan</T><T v="title">{s.planName}</T></View>
              {forever ? <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: c.trustWash }}><T v="caption" strong style={{ color: c.trust }}>Free forever</T></View> : st && <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: st[1] === "trust" ? c.trustWash : st[1] === "alert" ? c.alertWash : c.accentWash }}><T v="caption" strong style={{ color: st[1] === "trust" ? c.trust : st[1] === "alert" ? c.alert : c.text }}>{st[0]}</T></View>}
            </View>
            {s.renews && s.nextChargeAt ? (
              <View style={{ backgroundColor: c.raised, borderRadius: 18, padding: 14, gap: 2 }}>
                <T v="caption" tone="muted">Next billing</T>
                <T v="headline">{money(s.nextChargeMinor ?? 0, s.currency)} on {niceDate(s.nextChargeAt)}</T>
                {s.inIntro && <T v="caption" tone="muted">Your intro period ends then. Turn off auto-renew before that date to avoid this charge.</T>}
                {s.pendingPlanName && <T v="caption" tone="muted">Switching to {s.pendingPlanName} from that date.</T>}
              </View>
            ) : (
              <T tone="muted">{forever ? "Every feature is free for you, for life — nothing to pay, nothing renews." : s.status === "REWARD" ? "Free reward days — nothing renews." : `Premium stays on until ${niceDate(s.endsAt)}. You won't be charged again.`}</T>
            )}
            {s.status === "PAST_DUE" && <Banner tone="alert">{store ? `${store} couldn't take your last payment. Premium stays on for a few days — check the payment method in your ${store} account.` : "We couldn't take your last payment. Premium stays on for a few days while we retry — check your UPI Autopay or card."}</Banner>}
            {s.bankedDays > 0 && <T v="caption" tone="muted">🎁 {s.bankedDays} reward days saved — they start when this plan ends.</T>}
            {store ? (
              <View style={{ gap: 8 }}>
                <T v="caption" tone="muted">Billed by {store}. Change or cancel it in your {store} subscriptions.</T>
                <Button title={`Manage in ${store}`} v="outline" icon="card" full onPress={() => openStoreSubscriptions().catch((e) => setMsg({ tone: "alert", text: e.message }))} />
              </View>
            ) : s.renews && (
              <View style={{ gap: 8 }}>
                <Button title="Change plan" v="outline" icon="sliders" full onPress={() => setSheet("change")} />
                <Button title="Cancel subscription" v="ghost" full onPress={() => setSheet("cancel")} />
              </View>
            )}
            {!s.renews && s.status === "CANCELLED" && s.provider === "MOCK" && <Button title="Turn auto-renew back on" v="outline" full loading={busy} onPress={() => act({ action: "resume" }, "Auto-renew is back on.")} />}
          </View>
        ))}

        {(q.data?.payments.length ?? 0) > 0 && (
          <View style={{ gap: 8 }}>
            <T v="headline">Payments</T>
            {q.data!.payments.map((p) => (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: c.surface }}>
                <Icon name="receipt" color={p.status === "FAILED" ? c.alert : c.brand} />
                <View style={{ flex: 1 }}>
                  <T v="callout" strong>{money(p.amountMinor, p.currency)} · {p.planName}</T>
                  <T v="caption" tone="muted">{niceDate(p.paidAt ?? p.createdAt)} · {p.status === "CAPTURED" ? (p.method === "app_store" ? "App Store" : p.method === "google_play" ? "Google Play" : p.method ? p.method.toUpperCase() : "Paid") : p.status === "FAILED" ? "Failed" : p.status === "REFUNDED" ? "Refunded" : p.status === "PARTIALLY_REFUNDED" ? `${money(p.refundedMinor, p.currency)} refunded` : p.status.toLowerCase()}</T>
                  {p.failureReason && <T v="caption" tone="muted">{p.failureReason}</T>}
                </View>
                {p.invoiceNo && <Pressable accessibilityRole="button" accessibilityLabel={`Download invoice ${p.invoiceNo}`} onPress={() => invoice(p.id)} hitSlop={8}><Icon name="download" color={c.brand} /></Pressable>}
              </View>
            ))}
          </View>
        )}
        <T v="caption" tone="faint">Card numbers, UPI PINs and bank passwords are handled by the payment gateway and never stored by Kinara.</T>
      </ScrollView>

      <BottomSheet open={sheet === "cancel"} onClose={() => setSheet(null)} title="Cancel your subscription?">
        <T>You won't be charged again. {s?.planName} stays on until {niceDate(s?.endsAt)} — after that you're back on the free plan with all your matches and chats.</T>
        <Button title="Cancel subscription" v="danger" full loading={busy} onPress={() => act({ action: "cancel" }, `Done — no more charges. ${s?.planName} stays on until ${niceDate(s?.endsAt)}.`)} />
        <Button title="Keep it" v="ghost" full onPress={() => setSheet(null)} />
      </BottomSheet>

      <BottomSheet open={sheet === "change"} onClose={() => setSheet(null)} title="Change plan">
        <T tone="muted">Your new plan and price start at your next billing date. No extra charge today.</T>
        {cat.data?.plans.map((p) => (
          <Button key={p.code} title={`${p.name} — ${money(p.quote.regularMinor, p.quote.currency)}/${per(p.quote.periodDays)}${p.code === (s?.pendingPlanCode ?? s?.planCode) ? " (selected)" : ""}`} v={p.code === (s?.pendingPlanCode ?? s?.planCode) ? "primary" : "outline"} full
            loading={busy} onPress={() => act({ action: "change", planCode: p.code }, p.code === s?.planCode ? "You'll stay on your current plan." : `Switching to ${p.name} from ${niceDate(s?.nextChargeAt)}.`)} />
        ))}
      </BottomSheet>
    </Screen>
  );
}
