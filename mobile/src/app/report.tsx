import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { REPORT_CATEGORIES } from "@shared/constants";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, Chip, Screen, SheetHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export default function Report() {
  const { userId, name, messageId } = useLocalSearchParams<{ userId: string; name: string; messageId?: string }>();
  const { c } = useTheme();
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setErr(""); setBusy(true);
    try {
      await api("/api/reports", { body: { reportedId: userId, category, details: details.trim(), messageId: messageId || undefined, alsoBlock: true } });
      haptic.success();
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["discovery"] });
      setDone(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 14 }}>
          <Animated.View entering={ZoomIn.springify()} style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.trustWash, alignItems: "center", justifyContent: "center" }}>
            <Icon name="shield" size={48} color={c.trust} />
          </Animated.View>
          <T v="title" center>Thanks for telling us</T>
          <T tone="muted" center>{name} has been blocked, so you won't see each other again. Our safety team will review your report — {name} won't know it was you.</T>
        </View>
        <Button title="Done" size="lg" full onPress={() => { router.dismissAll?.(); router.replace("/discover"); }} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]} pad={false}>
      <SheetHeader title={`Report ${name}`} onClose={() => router.back()} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
          <T tone="muted">{name} won't know you reported them. We'll also block them for you.</T>
          {messageId ? <Banner tone="info">You're reporting a specific message. Our team will see it in context.</Banner> : null}
          <View style={{ gap: 8 }}>
            <T v="callout" tone="muted">What happened?</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(REPORT_CATEGORIES).map(([k, l]) => <Chip key={k} label={l} selected={category === k} onPress={() => setCategory(k)} />)}
            </View>
          </View>
          {(category === "SAFETY" || category === "UNDERAGE") && (
            <Banner tone="warn">If you're in immediate danger, contact local emergency services first — 112 in India, 911 in the US, 999 in the UK.</Banner>
          )}
          <View style={{ gap: 6 }}>
            <T v="callout" tone="muted">Anything else we should know? (optional)</T>
            <TextInput value={details} onChangeText={setDetails} multiline maxLength={1000} accessibilityLabel="Details"
              style={{ minHeight: 110, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.line, padding: 14, fontSize: 17, color: c.text, fontFamily: "Figtree_500Medium", textAlignVertical: "top" }} />
          </View>
          {err ? <Banner tone="alert">{err}</Banner> : null}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Button title="Report and block" v="danger" size="lg" full loading={busy} disabled={!category} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
