import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { INTENTS } from "@shared/constants";
import { Icon, VerifiedBadge, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { PhotoView, ProgressBar, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { MyPhoto } from "@/lib/types";
import { dusk } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

function RowLink({ icon, label, sub, onPress, tone }: { icon: IconName; label: string; sub?: string; onPress: () => void; tone?: "trust" | "alert" }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: pressed ? c.raised : c.surface })}>
      <Icon name={icon} color={tone ? c[tone] : c.text} />
      <View style={{ flex: 1 }}>
        <T v="headline" style={{ fontFamily: "Figtree_600SemiBold" }}>{label}</T>
        {sub ? <T v="caption" tone="muted">{sub}</T> : null}
      </View>
      <Icon name="forward" size={20} color={c.faint} />
    </Pressable>
  );
}

function nextTip(me: ReturnType<typeof useAuth>["me"], photos: number) {
  if (!me?.profile) return "";
  if (photos < 3) return "Add another photo — three or more get noticed far more often.";
  if ((me.profile.bio ?? "").length < 40) return "Add a few lines about you. It gives people something to reply to.";
  if (me.user.selfieStatus !== "VERIFIED") return "Get your verified ring so people know you're real.";
  if ((me.profile.interests ?? "").split(",").length < 5) return "Add one more interest to improve your recommendations.";
  return "Looking great. Keep your photos fresh.";
}

export default function ProfileTab() {
  const { me } = useAuth();
  const { c } = useTheme();
  const photos = useQuery({ queryKey: ["photos"], queryFn: () => api<{ photos: MyPhoto[] }>("/api/photos") });
  const p = me?.profile;
  const age = me?.user.dob ? Math.floor((Date.now() - new Date(me.user.dob).getTime()) / (365.25 * 86400_000)) : null;
  const premium = me?.user.planCode && me.user.planCode !== "FREE";

  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32, gap: 18 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 6, flexDirection: "row", alignItems: "center" }}>
          <T v="title" style={{ flex: 1 }}>Profile</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push("/settings")} hitSlop={10}><Icon name="settings" /></Pressable>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => router.push("/edit-profile")} style={{ marginHorizontal: 20, alignItems: "center", gap: 10 }}>
          <PhotoView photo={photos.data?.photos[0]} rounded={64} style={{ width: 128, height: 128, borderWidth: 4, borderColor: me?.user.selfieStatus === "VERIFIED" ? c.trust : c.surface }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T v="display">{p?.firstName}{age ? `, ${age}` : ""}</T>
            {me?.user.selfieStatus === "VERIFIED" && <VerifiedBadge size={22} />}
          </View>
          <T tone="muted">{p?.city}{p?.intent ? ` · ${INTENTS[p.intent as keyof typeof INTENTS]}` : ""}</T>
        </Pressable>

        <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderRadius: 22, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T v="headline">Your profile is {p?.completeness ?? 0}% complete</T>
          </View>
          <ProgressBar value={p?.completeness ?? 0} />
          <T v="callout" tone="muted">{nextTip(me, photos.data?.photos.length ?? 0)}</T>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={() => router.push("/edit-profile")} accessibilityRole="button" style={{ flex: 1, alignItems: "center", backgroundColor: c.raised, borderRadius: 999, paddingVertical: 10 }}><T v="callout">Edit profile</T></Pressable>
            <Pressable onPress={() => router.push("/photos")} accessibilityRole="button" style={{ flex: 1, alignItems: "center", backgroundColor: c.raised, borderRadius: 999, paddingVertical: 10 }}><T v="callout">Photos</T></Pressable>
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.push(premium ? "/subscription" : "/premium")} style={{ marginHorizontal: 20, borderRadius: 22, overflow: "hidden" }}>
          <LinearGradient colors={[...dusk]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="sparkle" color="#F5B656" /><T v="headline" tone="white">{premium ? `You're on ${me?.user.planCode.replace("_", " ").toLowerCase()}` : "Premium"}</T></View>
            <T v="callout" tone="white" style={{ opacity: 0.85 }}>{premium ? "Manage your plan, payments and invoices." : "See who likes you, get more likes and finer filters. Free stays fully usable."}</T>
          </LinearGradient>
        </Pressable>

        <View style={{ marginHorizontal: 20, borderRadius: 22, overflow: "hidden", gap: 1, backgroundColor: c.line }}>
          <RowLink icon="shield" tone="trust" label="Safety Center" sub="Verification, reporting, tips" onPress={() => router.push("/safety")} />
          <RowLink icon="gift" label="Invite & earn" sub="Premium days for every verified friend" onPress={() => router.push("/referrals")} />
          <RowLink icon="eye" label="Privacy Center" sub="Who sees you and your data" onPress={() => router.push("/privacy")} />
          <RowLink icon="sliders" label="Discovery preferences" sub="Who you see and how far" onPress={() => router.push("/preferences")} />
          <RowLink icon="bell" label="Notifications" onPress={() => router.push("/notifications")} />
          <RowLink icon="settings" label="Settings" sub="Security, subscription, appearance" onPress={() => router.push("/settings")} />
        </View>
      </ScrollView>
    </Screen>
  );
}
