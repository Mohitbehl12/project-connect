import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DATE_KINDS } from "@shared/constants";
import * as ImagePicker from "expo-image-picker";
import { BottomSheet, SheetAction } from "@/components/BottomSheet";
import { PhotoBubble, VoiceBubble, VoiceRecorder, appendVoice } from "@/components/ChatMedia";
import { appendPhoto } from "@/lib/photoFile";
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
  const [callNote, setCallNote] = useState("");
  const [menu, setMenu] = useState(false);
  const [plus, setPlus] = useState(false);
  const [msgAction, setMsgAction] = useState<Message | null>(null);
  const [recording, setRecording] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [kindCheck, setKindCheck] = useState<string | null>(null);
  const [askCall, setAskCall] = useState<"AUDIO" | "VIDEO" | null>(null);
  const cs = useQuery({
    queryKey: ["callstate", id],
    queryFn: () => api<{ canCall: boolean; reason: string | null; code: string | null; canRequest: boolean; requestBlockedReason: string | null;
      request: { id: string; kind: string; state: string; mine: boolean; expiresAt: string } | null }>(`/api/matches/${id}/call`),
    retry: false,
  });
  async function callRequest(action: "accept" | "decline" | "cancel" | "revoke") {
    const r = cs.data?.request;
    if (!r) return;
    try { await api(`/api/call-requests/${r.id}`, { body: { action } }); haptic.success(); } catch (e: any) { setErr(e.message); }
    cs.refetch();
  }
  async function sendCallRequest(kind: "AUDIO" | "VIDEO") {
    setAskCall(null);
    try { await api("/api/call-requests", { body: { matchId: id, kind } }); haptic.success(); setCallNote(`Call request sent. You can call once ${detail.data?.other.firstName ?? "they"} accepts.`); setTimeout(() => setCallNote(""), 6000); }
    catch (e: any) { setErr(e.message); }
    cs.refetch();
  }
  const detail = useQuery({ queryKey: ["match", id], queryFn: () => api<Detail>(`/api/matches/${id}`) });
  // Instant updates: /wait answers the moment this chat changes or the other person types; a slow
  // refetch stays as a safety net.
  const msgs = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api<{ messages: Message[]; ended: boolean; mediaUnlocked?: boolean }>(`/api/matches/${id}/messages`),
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
          if (v !== -1 && r.version !== v) { qc.invalidateQueries({ queryKey: ["messages", id] }); qc.invalidateQueries({ queryKey: ["callstate", id] }); }
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
  const lastMineId = useMemo(() => [...(msgs.data?.messages ?? [])].reverse().find((m) => m.mine && m.kind !== "SYSTEM")?.id, [msgs.data]);
  const mediaUnlocked = !!msgs.data?.mediaUnlocked;

  async function send(confirmed = false, override?: string) {
    const body = (override ?? text).trim();
    if (!body) return;
    setErr("");
    setText("");
    haptic.light();
    // Optimistic append
    const tmp = `tmp-${Date.now()}`;
    qc.setQueryData(["messages", id], (old: any) => old && ({ ...old, messages: [...old.messages, { id: tmp, mine: true, kind: "TEXT", body, deleted: false, createdAt: new Date().toISOString(), warning: null }] }));
    try {
      await api(`/api/matches/${id}/messages`, { body: { body, confirmed } });
    } catch (e: any) {
      qc.setQueryData(["messages", id], (old: any) => old && ({ ...old, messages: old.messages.filter((m: Message) => m.id !== tmp) }));
      setText(body);
      if (e.code === "kindness_check") { setKindCheck(body); haptic.warning(); return; }
      setErr(e.message);
      haptic.warning();
    }
    msgs.refetch();
  }

  async function sendMedia(build: (f: FormData) => Promise<void>) {
    setErr(""); setSendingMedia(true);
    try {
      const form = new FormData();
      await build(form);
      await api(`/api/matches/${id}/media`, { form });
      haptic.success();
    } catch (e: any) { setErr(e.message); haptic.warning(); }
    finally { setSendingMedia(false); msgs.refetch(); }
  }

  async function pickPhoto(camera: boolean) {
    setPlus(false);
    if (camera && Platform.OS !== "web") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setErr("Allow camera access in Settings to send a photo."); return; }
    }
    const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (r.canceled || !r.assets?.[0]) return;
    const asset = r.assets[0];
    await sendMedia(async (f) => { f.append("kind", "photo"); await appendPhoto(f, asset); });
  }

  async function heart(m: Message) {
    const on = !m.hearts?.mine;
    haptic.light();
    qc.setQueryData(["messages", id], (old: any) => old && ({ ...old, messages: old.messages.map((x: Message) => x.id === m.id ? { ...x, hearts: { mine: on, theirs: !!x.hearts?.theirs } } : x) }));
    await api(`/api/messages/${m.id}/react`, { body: { on } }).catch(() => msgs.refetch());
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

  async function startCall(kind: "AUDIO" | "VIDEO") {
    const who = detail.data?.other;
    if (!who) return;
    const st = cs.data;
    if (st && !st.canCall) {
      // No consent yet: ask first (or explain why not).
      if (st.canRequest) { setAskCall(kind); return; }
      const mineWaiting = st.request?.state === "PENDING" && st.request.mine;
      setCallNote(mineWaiting ? `Waiting for ${who.firstName} to accept your call request.` : st.requestBlockedReason ?? st.reason ?? "Calls aren't available right now.");
      setTimeout(() => setCallNote(""), 6000);
      return;
    }
    try {
      const r = await api<{ call: { id: string } }>(`/api/matches/${id}/call`, { body: { kind } });
      haptic.light();
      router.push({ pathname: "/call/[id]", params: { id: r.call.id, name: who.firstName, photo: who.photos[0]?.url ?? "", userId: who.id } });
    } catch (e: any) { setCallNote(e.message); setTimeout(() => setCallNote(""), 5000); }
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
          <IconButton icon="call" label="Voice call" tone="none" disabled={ended} onPress={() => startCall("AUDIO")} />
          <IconButton icon="video" label="Video call" tone="none" disabled={ended} onPress={() => startCall("VIDEO")} />
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

      {(() => {
        const r = cs.data?.request;
        if (!r || ended) return null;
        const name = o?.firstName ?? "They";
        const what = r.kind === "VIDEO" ? "video call" : "voice call";
        const box = (children: ReactNode, tone: "accent" | "trust" = "accent") => (
          <View accessibilityLiveRegion="polite" style={{ marginHorizontal: 12, marginTop: 10, padding: 12, borderRadius: 18, gap: 8, backgroundColor: tone === "trust" ? c.trustWash : c.accentWash }}>{children}</View>
        );
        if (r.state === "PENDING" && !r.mine) return box(<>
          <T v="callout" strong>{name} wants to call you ({what})</T>
          <T v="caption" tone="muted">You won't be connected unless you accept.</T>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Pressable accessibilityRole="button" onPress={() => callRequest("accept")} style={{ backgroundColor: c.trust, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}><T v="callout" strong style={{ color: "#FFFFFF" }}>Accept</T></Pressable>
            <Pressable accessibilityRole="button" onPress={() => callRequest("decline")} style={{ backgroundColor: c.surface, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}><T v="callout" strong>Decline</T></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setMenu(true)} style={{ paddingHorizontal: 10, paddingVertical: 8 }}><T v="callout" tone="alert">Block or report</T></Pressable>
          </View>
        </>);
        if (r.state === "PENDING" && r.mine) return box(<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T v="callout" style={{ flex: 1 }}>Call request sent · waiting for {name} to accept</T>
          <Pressable accessibilityRole="button" onPress={() => callRequest("cancel")}><T v="callout" strong>Cancel</T></Pressable>
        </View>);
        if (r.state === "ACCEPTED") return box(<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T v="callout" style={{ flex: 1 }}>{r.mine ? `${name} accepted your call request. You can now start the call.` : `You accepted — you can call each other until ${new Date(r.expiresAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`}</T>
          {r.mine ? <Pressable accessibilityRole="button" onPress={() => startCall(r.kind === "AUDIO" ? "AUDIO" : "VIDEO")} style={{ backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}><T v="callout" strong style={{ color: c.brandText }}>Start call</T></Pressable>
            : <Pressable accessibilityRole="button" onPress={() => callRequest("revoke")}><T v="callout" strong>Stop allowing</T></Pressable>}
        </View>, "trust");
        return null;
      })()}

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
          const grouped = prev && prev.mine === m.mine && prev.kind !== "SYSTEM";
          const report = () => router.push({ pathname: "/report", params: { userId: o?.id ?? "", name: o?.firstName ?? "", messageId: m.id } });
          const photo = m.kind === "PHOTO" && m.media && !m.deleted;
          return (
            <Animated.View entering={FadeInUp.duration(160)} style={{ alignItems: m.mine ? "flex-end" : "flex-start", marginTop: grouped ? 2 : 10 }}>
              <Pressable onLongPress={() => { if (!m.deleted && !m.id.startsWith("tmp")) { haptic.medium(); setMsgAction(m); } }}
                accessibilityHint={m.mine ? "Long press for options, such as delete or a heart" : "Long press to send a heart or report"}
                style={photo ? { maxWidth: "80%" } : { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: m.mine && !grouped ? 6 : 20, borderBottomLeftRadius: !m.mine && !grouped ? 6 : 20, backgroundColor: m.mine ? undefined : c.surface, overflow: "hidden", opacity: m.deleted ? 0.6 : 1 }}>
                {m.mine && !photo && <LinearGradient colors={[...g.dusk]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />}
                {photo ? <PhotoBubble m={m} onReport={report} />
                  : m.kind === "VOICE" && m.media && !m.deleted ? <VoiceBubble m={m} />
                  : <T style={{ color: m.mine ? "#FFFFFF" : c.text, fontStyle: m.deleted ? "italic" : "normal" }}>{m.deleted ? "Message deleted" : m.body}</T>}
              </Pressable>
              {(m.hearts?.mine || m.hearts?.theirs) && !m.deleted ? (
                <Pressable accessibilityRole="button" accessibilityLabel={m.hearts.mine ? "Remove your heart" : "Heart"} onPress={() => heart(m)}
                  style={{ marginTop: -8, marginHorizontal: 8, backgroundColor: c.surface, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: c.line }}>
                  <T v="caption">{"❤️"}{m.hearts.mine && m.hearts.theirs ? " 2" : ""}</T>
                </Pressable>
              ) : null}
              {m.warning && (
                <Pressable onPress={report}
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
      {callNote ? <View style={{ paddingHorizontal: 14 }}><Banner tone="info">{callNote}</Banner></View> : null}
      {sendingMedia ? <View style={{ paddingHorizontal: 14 }}><Banner tone="info">Sending…</Banner></View> : null}
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
          {recording ? (
            <VoiceRecorder onCancel={(e) => { setRecording(false); if (e) setErr(e); }}
              onSend={({ uri, ms }) => { setRecording(false); void sendMedia(async (f) => { f.append("kind", "voice"); f.append("ms", String(ms)); await appendVoice(f, uri); }); }} />
          ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 8 }}>
            <IconButton icon="plus" label="More: photos, voice messages, suggest a date" size={44} onPress={() => setPlus(true)} />
            <TextInput value={text} onChangeText={onType} placeholder={`Message ${o?.firstName ?? ""}`} placeholderTextColor={c.faint} multiline maxLength={2000}
              accessibilityLabel="Message"
              style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: c.raised, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 17, color: c.text, fontFamily: "Figtree_500Medium" }} />
            {text.trim() || !mediaUnlocked
              ? <IconButton icon="send" label="Send" size={44} tone="brand" disabled={!text.trim()} onPress={() => send()} />
              : <IconButton icon="mic" label="Record a voice message" size={44} tone="brand" disabled={sendingMedia} onPress={() => { setErr(""); setRecording(true); }} />}
          </View>
          )}
        </View>
      )}

      <BottomSheet open={plus} onClose={() => setPlus(false)} title="Share">
        {mediaUnlocked ? (
          <>
            <SheetAction label="Send a photo" icon={<Icon name="image" />} onPress={() => pickPhoto(false)} />
            <SheetAction label="Take a photo" icon={<Icon name="camera" />} onPress={() => pickPhoto(true)} />
            <SheetAction label="Voice message" icon={<Icon name="mic" />} onPress={() => { setPlus(false); setErr(""); setRecording(true); }} />
          </>
        ) : (
          <T v="callout" tone="muted">Photos and voice messages unlock once you've both sent a message.</T>
        )}
        <SheetAction label="Suggest a date" icon={<Icon name="calendar" />} onPress={() => { setPlus(false); router.push({ pathname: "/date/[matchId]", params: { matchId: id, name: o?.firstName ?? "" } }); }} />
      </BottomSheet>

      <BottomSheet open={!!askCall} onClose={() => setAskCall(null)} title="Request a call">
        <T tone="muted">{o?.firstName ?? "They"} will get your request and can accept or decline. You'll only be able to call once they accept — and they still answer the call themselves.</T>
        <SheetAction label="Request a video call" icon={<Icon name="video" />} onPress={() => sendCallRequest("VIDEO")} />
        <SheetAction label="Request a voice call" icon={<Icon name="call" />} onPress={() => sendCallRequest("AUDIO")} />
      </BottomSheet>

      <BottomSheet open={!!kindCheck} onClose={() => setKindCheck(null)} title="Before you send">
        <T tone="muted">This might come across as hurtful. Kind messages get far more replies.</T>
        <SheetAction label="Edit my message" icon={<Icon name="edit" />} onPress={() => setKindCheck(null)} />
        <SheetAction label="Send anyway" icon={<Icon name="send" />} onPress={() => { const b = kindCheck!; setKindCheck(null); void send(true, b); }} />
      </BottomSheet>

      <BottomSheet open={!!msgAction} onClose={() => setMsgAction(null)} title="Message">
        {msgAction && !msgAction.deleted && msgAction.kind !== "SYSTEM" && (
          <SheetAction label={msgAction.hearts?.mine ? "Remove heart" : "Send a heart ❤️"} icon={<Icon name="likes" />} onPress={() => { const m = msgAction; setMsgAction(null); void heart(m); }} />
        )}
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
