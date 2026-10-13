import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import Animated, { FadeInDown, useSharedValue, withTiming, Easing } from "react-native-reanimated";
import { Button } from "@/components/Button";
import { LikeBurst } from "@/components/CardDeck";
import { T } from "@/components/Text";
import { Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, niceDate } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import type { SubSummary } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";

type Status = { payment: { id: string; status: string; amountMinor: number; currency: string; planCode: string; invoiceNo: string | null; failureReason: string | null; paidAt: string | null; providerPaymentId: string | null }; subscription: SubSummary };

/** Waits for the gateway's confirmation (webhook), then shows a receipt — or a clear way forward. */
export default function PaymentResult() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { refetchMe } = useAuth();
  const [tries, setTries] = useState(0);
  const q = useQuery({
    queryKey: ["payment", id],
    queryFn: () => api<Status>(`/api/billing/payments/${id}`),
    refetchInterval: (query) => (query.state.data?.payment.status === "CREATED" && tries < 40 ? 2000 : false),
  });
  const st = q.data?.payment.status;
  const burst = useSharedValue(0);
  useEffect(() => { if (st === "CREATED") setTries((t) => t + 1); }, [q.dataUpdatedAt]);
  useEffect(() => {
    if (st === "CAPTURED") {
      haptic.success();
      burst.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
      refetchMe();
      for (const k of ["catalogue", "subscription", "likes", "matches"]) qc.invalidateQueries({ queryKey: [k] });
    }
    if (st === "FAILED") haptic.warning();
  }, [st]);

  async function invoice() {
    const r = await api<{ url: string }>(`/api/billing/invoices/${id}?link=1`);
    await WebBrowser.openBrowserAsync(r.url);
  }

  const p = q.data?.payment, s = q.data?.subscription;
  return (
    <Screen ambient="full" edges={["top", "bottom"]}>
      <View style={{ flex: 1, justifyContent: "center", gap: 18 }}>
        {(!p || st === "CREATED") && (
          <View style={{ alignItems: "center", gap: 10 }}>
            <T v="title" center>{tries >= 40 ? "Still confirming with your bank" : "Confirming your payment…"}</T>
            <T tone="muted" center>{tries >= 40 ? "This can take a few minutes with some banks. You can leave this screen — we'll notify you when it's done, and you won't be charged twice." : "This usually takes a few seconds."}</T>
            {tries >= 40 && <Button title="Back to Premium" v="outline" onPress={() => router.replace("/premium")} />}
          </View>
        )}
        {p && st === "CAPTURED" && (
          <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 16 }}>
            <View style={{ height: 90, alignItems: "center", justifyContent: "center" }}>
              <LikeBurst progress={burst} top="50%" spread={1.6} />
              <T style={{ fontSize: 56 }}>🎉</T>
            </View>
            <T v="display" center>Payment successful</T>
            <View style={{ backgroundColor: c.surface, borderRadius: 24, padding: 18, gap: 10, borderWidth: 1, borderColor: c.line }}>
              {[
                ["Amount", money(p.amountMinor, p.currency)],
                ["Plan", s?.planName ?? p.planCode],
                ["Transaction ID", p.providerPaymentId ?? p.id],
                ["Invoice", p.invoiceNo ?? "—"],
                ...(s?.renews && s.nextChargeAt ? [["Next billing date", `${niceDate(s.nextChargeAt)} · ${money(s.nextChargeMinor ?? 0, s.currency)}`]] : s?.endsAt ? [["Premium until", niceDate(s.endsAt)]] : []),
              ].map(([k, v]) => (
                <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}><T tone="muted">{k}</T><T strong style={{ flexShrink: 1, textAlign: "right" }} numberOfLines={1}>{v}</T></View>
              ))}
            </View>
            <T v="caption" tone="muted" center>A confirmation is in your notifications. You can turn off auto-renew any time in My Subscription.</T>
            <Button title="Download invoice" v="outline" icon="download" full onPress={invoice} />
            <Button title="Start exploring" size="lg" full onPress={() => router.replace("/discover")} />
          </Animated.View>
        )}
        {p && st === "FAILED" && (
          <Animated.View entering={FadeInDown} style={{ gap: 14 }}>
            <T v="display">We couldn't process your payment.</T>
            <T tone="muted">{p.failureReason ?? "Your bank or card may have declined the payment."} No money was taken for this attempt.</T>
            <Button title="Try again" size="lg" full onPress={() => router.replace("/premium")} />
            <Button title="Change payment method" v="outline" full onPress={() => router.replace("/premium")} />
            <Button title="Contact support" v="ghost" full onPress={() => Linking.openURL("mailto:support@example.com?subject=Payment%20help")} />
          </Animated.View>
        )}
      </View>
    </Screen>
  );
}
