import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DATE_KINDS } from "@shared/constants";
import { BottomSheet, SheetAction } from "@/components/BottomSheet";
import { IconButton } from "@/components/Button";
import { Icon, VerifiedBadge } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, ErrorState, PhotoView } from "@/components/ui";
import { api } from "@/lib/api";
import { cardCache } from "@/lib/cardCache";
import { haptic } from "@/lib/haptics";
import type { Card, Message } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";

type Detail = {
  match: { id: string; score: number };
  other: Card & { online: boolean };
  starters: { tip: string; text: string }[];
  dates: { id: string; kind: string; place: string; startsAt: string; status: string; note: string | null; mine: boolean }[];
};

const time = (d: string) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Chat() {
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const { c, g } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [text, setText] = useState(draft ?? "");
  const [err, setErr] = useState("");
  const [menu, setMenu] = useState(false);
  const [plus, setPlus] = useState(false);
  const [msgAction, setMsgAction] = useState<Message | null>(null);
  const detail = useQuery({ queryKey: ["match", id], queryFn: () => api<Detail>(`/api/matches/${id}`) });
  // Instant updates: /wait answers the moment this chat changes or the other person types; a slow
  // refetch stays as a safety net.
  const msgs = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api<{ messages: Message[]; ended: boolean }>(`/api/matches/${id}/messages`),
    refetchInterval: 20_000,
  });
  const [otherTyping, setOtherTyping] = useState(false);
  useEffect(() => {
    let alive = true, v = -1, typing = false;
    const ctrl = new AbortController();
    (async () => {
      while (alive) {
        try {
          const r: { version: number; typing: boolean } = await api(`/api/matches/${id}/wait?v=${v}&typing=${typing ? 1 : 0}`, { signal: ctrl.signal });
          if (!alive) break;
          if (v !== -1 && r.version !== v) qc.invalidateQueries({ queryKey: ["messages", id] });
          v = r.version; typing = r.typing; setOtherTyping(r.typing);
        } catch {
          if (!alive) break;
          await new Promise((res) => setTimeout(res, 3000)); // offline or server restarting: try again shortly
        }
      }
    })();
    return () => { alive = false; ctrl.abort(); };
  }, [id, qc]);
  const lastTypingSent = useRef(0);
  function onType(t: string) {
    setText(t);
    if (t.trim() && Date.now() - lastTypingSent.current > 3000) {
      lastTypingSent.current = Date.now();
      api(`/api/matches/${id}/typing`, { body: { typing: true } }).catch(() => {});
    }
  }
  const list = useRef<FlatList>(null);

  useEffect(() => { if (detail.data) cardCache.put([detail.data.other]); }, [detail.data]);
  useEffect(() => { qc.invalidateQueries({ queryKey: ["matches"] }); }, [msgs.data?.messages.length, qc]);

  const items = useMemo(() => [...(msgs.data?.messages ?? [])].reverse(), [msgs.data]);
  const hasText = (msgs.data?.messages ?? []).some((m) => m.kind === "TEXT");
  const lastMineId = useMemo(() => [...(msgs.data?.messages ?? [])].reverse().find((m) => m.mine && m.kind === "TEXT")?.id, [msgs.data]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setErr("");
    setText("");
    haptic.light();
    // Optimistic append
    qc.setQueryData(["messages", id], (old: any) => old && ({ ...old, messages: [...old.messages, { id: `tmp-${Date.now()}`, mine: true, kind: "TEXT", body, deleted: false, createdAt: new Date().toISOString(), warning: null }] }));
    try {
      await api(`/api/matches/${id}/messages`, { body: { body } });
    } catch (e: any) {
      setErr(e.message);
      setText(body);
      haptic.warning();
    }
    msgs.refetch();
  }

  async function unmatch() {
    setMenu(false);
    await api(`/api/matches/${id}/unmatch`, { method: "POST" }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["matches"] });
    router.back();
  }

  async function confirmDate(planId: string, action: "confirm" | "cancel") {
    await api(`/api/dates/${planId}`, { method: "PATCH", body: { action } }).catch((e) => setErr(e.message));
    haptic.success();
    detail.refetch(); msgs.refetch();
  }

  if (detail.error) return <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}><ErrorState message={(detail.error as Error).message} onRetry={() => router.back()} /></View>;
  const o = detail.data?.other;
  const nextDate = detail.data?.dates.find((d) => d.status !== "CANCELLED" && new Date(d.startsAt) > new Date());
  const ended = msgs.data?.ended;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, height: 60 }}>
          <IconButton icon="back" label="Back" tone="none" onPress={() => router.back()} />
          <Pressable accessibilityRole="button" accessibilityLabel={o ? `Open ${o.firstName}'s profile` : "Profile"} disabled={!o}
            onPress={() => o && router.push({ pathname: "/profile/[id]", params: { id: o.id, from: "match" } })}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <PhotoView photo={o?.photos[0]} rounded={20} style={{ width: 40, height: 40 }} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <T v="headline" numberOfLines={1}>{o?.firstName ?? ""}</T>
                {o?.verified && <VerifiedBadge size={16} />}
              </View>
              <T v="caption" tone={o?.online ? "trust" : "faint"}>{o?.online ? "Active now" : o?.city ?? ""}</T>
            </View>
          </Pressable>
          <IconButton icon="calendar" label="Suggest a date" tone="none" disabled={ended} onPress={() => router.push({ pathname: "/date/[matchId]", params: { matchId: id, name: o?.firstName ?? "" } })} />
          <IconButton icon="shield" label="Safety and options" tone="none" onPress={() => setMenu(true)} />
        </View>
        {nextDate && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: nextDate.status === "CONFIRMED" ? c.trustWash : c.accentWash }}>
            <Icon name="calendar" size={20} color={nextDate.status === "CONFIRMED" ? c.trust : c.text} />
            <View style={{ flex: 1 }}>
              <T v="callout">{nextDate.status === "CONFIRMED" ? "Date confirmed" : nextDate.mine ? "Waiting for a reply" : "Date suggestion"} · {DATE_KINDS[nextDate.kind as keyof typeof DATE_KINDS]}</T>
              <T v="caption" tone="muted">{nextDate.place} · {new Date(nextDate.startsAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</T>
            </View>
            {nextDate.status === "PROPOSED" && !nextDate.mine && (
              <Pressable accessibilityRole="button" onPress={() => confirmDate(nextDate.id, "confirm")} style={{ backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
                <T v="callout" style={{ color: c.brandText }}>Confirm</T>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <FlatList
        ref={list}
        inverted
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14, gap: 4, flexGrow: 1 }}
        ListHeaderComponent={otherTyping ? (
          <Animated.View entering={FadeIn} accessibilityLiveRegion="polite" style={{ alignSelf: "flex-start", backgroundColor: c.surface, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginTop: 4 }}>
            <T v="caption" tone="muted">{o?.firstName ?? "They"} is typing…</T>
          </Animated.View>
        ) : null}
        ListFooterComponent={detail.data && !hasText ? (
          <Animated.View entering={FadeIn} style={{ alignItems: "center", gap: 6, paddingVertical: 24 }}>
            <PhotoView photo={o?.photos[0]} rounded={44} style={{ width: 88, height: 88 }} />
            <T v="title" center>You matched with {o?.firstName}</T>
            <T tone="muted" center>{detail.data.match.score}% compatible. Not sure what to say? Try one of these.</T>
          </Animated.View>
        ) : null}
        renderItem={({ item: m, index }) => {
          if (m.kind === "SYSTEM") return <T v="caption" tone="faint" center style={{ paddingVertical: 8 }}>{m.body}</T>;
          const prev = items[index + 1];
          const grouped = prev && prev.mine === m.mine && prev.kind === "TEXT";
          return (
            <Animated.View entering={FadeInUp.duration(160)} style={{ alignItems: m.mine ? "flex-end" : "flex-start", marginTop: grouped ? 2 : 10 }}>
              <Pressable onLongPress={() => { if (!m.deleted && !m.id.startsWith("tmp")) { haptic.medium(); setMsgAction(m); } }}
                accessibilityHint={m.mine ? "Long press for options, such as delete" : "Long press to report this message"}
                style={{ maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: m.mine && !grouped ? 6 : 20, borderBottomLeftRadius: !m.mine && !grouped ? 6 : 20, backgroundColor: m.mine ? undefined : c.surface, overflow: "hidden", opacity: m.deleted ? 0.6 : 1 }}>
                {m.mine && <LinearGradient colors={[...g.dusk]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />}
                <T style={{ color: m.mine ? "#FFFFFF" : c.text, fontStyle: m.deleted ? "italic" : "normal" }}>{m.deleted ? "Message deleted" : m.body}</T>
              </Pressable>
              {m.warning && (
                <Pressable onPress={() => router.push({ pathname: "/report", params: { userId: o?.id ?? "", name: o?.firstName ?? "", messageId: m.id } })}
                  style={{ maxWidth: "85%", marginTop: 4, backgroundColor: c.accentWash, borderRadius: 14, padding: 10 }}>
                  <T v="caption">{m.warning} <T v="caption" strong>Report</T></T>
                </Pressable>
              )}
              {m.id === lastMineId && (
                <T v="caption" tone="faint" style={{ marginTop: 3 }}>{time(m.createdAt)}{m.read === undefined ? "" : m.read ? " · Read" : " · Sent"}</T>
              )}
            </Animated.View>
          );
        }}
      />

      {err ? <View style={{ paddingHorizontal: 14 }}><Banner tone="alert">{err}</Banner></View> : null}
      {ended ? (
        <View style={{ padding: 18, paddingBottom: insets.bottom + 18 }}><T tone="muted" center>This conversation has ended.</T></View>
      ) : (
        <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, paddingBottom: Math.max(insets.bottom, 8) }}>
          {detail.data && !hasText && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 10 }} keyboardShouldPersistTaps="handled">
              {detail.data.starters.map((s) => (
                <Pressable key={s.text} onPress={() => { haptic.tick(); setText(s.text); }} accessibilityRole="button"
                  style={{ maxWidth: 260, backgroundColor: c.raised, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <T v="caption" tone="muted">{s.tip}</T>
                  <T v="callout" numberOfLines={2}>{s.text}</T>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 8 }}>
            <IconButton icon="plus" label="More: suggest a date" size={44} onPress={() => setPlus(true)} />
            <TextInput value={text} onChangeText={onType} placeholder={`Message ${o?.firstName ?? ""}`} placeholderTextColor={c.faint} multiline maxLength={2000}
              accessibilityLabel="Message"
              style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: c.raised, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 17, color: c.text, fontFamily: "Figtree_500Medium" }} />
            <IconButton icon="send" label="Send" size={44} tone="brand" disabled={!text.trim()} onPress={send} />
          </View>
        </View>
      )}

      <BottomSheet open={plus} onClose={() => setPlus(false)} title="Share">
        <SheetAction label="Suggest a date" icon={<Icon name="calendar" />} onPress={() => { setPlus(false); router.push({ pathname: "/date/[matchId]", params: { matchId: id, name: o?.firstName ?? "" } }); }} />
        <T v="caption" tone="faint">Photos, voice notes and GIFs in chat are coming in the next update.</T>
      </BottomSheet>

      <BottomSheet open={!!msgAction} onClose={() => setMsgAction(null)} title="Message">
        {msgAction?.mine ? (
          <SheetAction label="Delete for both of you" tone="alert" icon={<Icon name="trash" color={c.alert} />}
            onPress={async () => { const m = msgAction; setMsgAction(null); await api(`/api/messages/${m.id}`, { method: "DELETE" }).catch(() => {}); msgs.refetch(); }} />
        ) : (
          <SheetAction label="Report this message" tone="alert" icon={<Icon name="flag" color={c.alert} />}
            onPress={() => { const m = msgAction!; setMsgAction(null); router.push({ pathname: "/report", params: { userId: o?.id ?? "", name: o?.firstName ?? "", messageId: m.id } }); }} />
        )}
      </BottomSheet>

      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Safety">
        <SheetAction label={`Report ${o?.firstName ?? ""}`} tone="alert" icon={<Icon name="flag" color={c.alert} />} onPress={() => { setMenu(false); router.push({ pathname: "/report", params: { userId: o?.id ?? "", name: o?.firstName ?? "" } }); }} />
        <SheetAction label={`Block ${o?.firstName ?? ""}`} tone="alert" icon={<Icon name="block" color={c.alert} />} onPress={async () => { setMenu(false); await api("/api/blocks", { body: { userId: o?.id } }).catch(() => {}); qc.invalidateQueries({ queryKey: ["matches"] }); router.back(); }} />
        <SheetAction label="Unmatch" icon={<Icon name="close" />} onPress={unmatch} />
        <SheetAction label="Safety tips" icon={<Icon name="shield" color={c.trust} />} onPress={() => { setMenu(false); router.push("/safety"); }} />
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}
