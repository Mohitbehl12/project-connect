import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { T } from "./Text";
import { api } from "@/lib/api";
import { useFeature } from "@/lib/appConfig";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

// Asks "How was this?" rarely (the server decides: at most once a week, once a month per moment).
const CHOICES = [["LOVE", "❤️", "Love this"], ["GOOD", "🙂", "Good"], ["OKAY", "😐", "Okay"], ["NEEDS_WORK", "🙁", "Needs improvement"], ["PROBLEM", "🚨", "Report a problem"]] as const;

export function FeedbackAsk({ context, question = "How is Kinara working for you?", always = false }: { context: "APP" | "MATCH" | "CHAT" | "DATE" | "CHECKIN" | "PREMIUM" | "ONBOARDING"; question?: string; always?: boolean }) {
  const { c } = useTheme();
  const q = useQuery({ queryKey: ["feedback-ask", context], queryFn: () => api<{ ask: boolean }>(`/api/feedback?context=${context}`), enabled: !always, staleTime: 3600_000 });
  const [rating, setRating] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"ask" | "comment" | "done" | "hidden">("ask");
  const on = useFeature("feedback");
  if (!on || state === "hidden" || (!always && !q.data?.ask)) return null;
  const send = async (r: string, text?: string) => {
    setState(r === "DISMISSED" ? "hidden" : "done");
    haptic.light();
    await api("/api/feedback", { body: { context, rating: r, comment: text?.trim() || undefined, platform: Platform.OS === "web" ? "web" : Platform.OS, appVersion: Constants.expoConfig?.version } }).catch(() => {});
  };
  return (
    <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
      {state === "done" ? <T v="callout">Thank you — every note is read by the team. 💛</T> : state === "comment" ? (
        <>
          <T v="callout">{rating === "PROBLEM" ? "What went wrong? (no personal details, please)" : "Anything you'd like to add? (optional)"}</T>
          <TextInput value={comment} onChangeText={setComment} multiline maxLength={1000} accessibilityLabel="Your comment"
            style={{ minHeight: 70, borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: 10, color: c.text, textAlignVertical: "top" }} placeholderTextColor={c.faint} placeholder="Type here…" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => send(rating!, comment)} style={{ backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}><T v="callout" strong style={{ color: c.brandText }}>Send</T></Pressable>
            {rating !== "PROBLEM" && <Pressable accessibilityRole="button" onPress={() => send(rating!)} style={{ paddingHorizontal: 12, paddingVertical: 8 }}><T v="callout">Skip</T></Pressable>}
          </View>
        </>
      ) : (
        <>
          <T v="callout">{question}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CHOICES.map(([k, e, l]) => (
              <Pressable key={k} accessibilityRole="button" accessibilityLabel={l} onPress={() => { setRating(k); setState("comment"); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.bg }}>
                <T>{e}</T><T v="caption">{l}</T>
              </Pressable>
            ))}
          </View>
          {!always && <Pressable accessibilityRole="button" onPress={() => send("DISMISSED")}><T v="caption" tone="muted">Not now</T></Pressable>}
        </>
      )}
    </View>
  );
}
