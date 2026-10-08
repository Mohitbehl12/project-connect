import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown, useSharedValue } from "react-native-reanimated";
import { BottomSheet, SheetAction } from "@/components/BottomSheet";
import { Button, IconButton } from "@/components/Button";
import { CardDeck, type DeckHandle, type Decision } from "@/components/CardDeck";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, Chip, EmptyState, ErrorState, Screen, Skeleton } from "@/components/ui";
import { Image } from "expo-image";
import { api, mediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cardCache } from "@/lib/cardCache";
import { haptic } from "@/lib/haptics";
import type { Card } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";

const MODES = [
  ["recommended", "Top picks"],
  ["interests", "Shared interests"],
  ["intent", "Same goals"],
  ["compatibility", "Personality"],
  ["nearby", "Nearby"],
] as const;

export default function Discover() {
  const { c } = useTheme();
  const { me } = useAuth();
  const qc = useQueryClient();
  const [mode, setMode] = useState<string>("recommended");
  const q = useQuery({
    queryKey: ["discovery", mode],
    queryFn: () => api<{ cards: Card[]; totalAvailable: number }>(`/api/discovery?mode=${mode}`),
    staleTime: 5 * 60_000,
  });
  const [index, setIndex] = useState(0);
  const [lastPassed, setLastPassed] = useState<Card | null>(null);
  const [notice, setNotice] = useState<{ tone: "warn" | "alert" | "trust"; text: string; premium?: boolean } | null>(null);
  const [options, setOptions] = useState<Card | null>(null);
  const [noteFor, setNoteFor] = useState<Card | null>(null);
  const [note, setNote] = useState("");
  const [extra, setExtra] = useState<Card[]>([]); // cards restored by undo
  const x = useSharedValue(0);
  const deck = useRef<DeckHandle>(null);

  const cards = [...extra, ...(q.data?.cards ?? []).slice(index)];
  const top = cards[0];
  const next = cards[1];
  useEffect(() => { if (q.data) cardCache.put(q.data.cards); }, [q.data]);
  useEffect(() => { setIndex(0); setExtra([]); }, [mode]);

  // Prefetch the next photos so cards never appear blank.
  useEffect(() => {
    const urls = cards.slice(1, 4).map((cd) => mediaUrl(cd.photos[0]?.url)).filter((u): u is string => !!u);
    if (urls.length) Image.prefetch(urls).catch(() => {});
  }, [top?.id]);

  function advance() {
    x.value = 0;
    if (extra.length) setExtra(extra.slice(1));
    else setIndex((i) => i + 1);
  }

  async function decide(kind: Decision | "PRIORITY", card: Card, withNote?: string) {
    if (kind === "PASS") setLastPassed(card); else setLastPassed(null);
    advance();
    try {
      const r = await api<{ matched: boolean; matchId: string | null }>("/api/likes", { body: { toId: card.id, kind, note: withNote || undefined } });
      setNotice(null);
      if (r.matched && r.matchId) {
        haptic.success();
        qc.invalidateQueries({ queryKey: ["matches"] });
        router.push({ pathname: "/match", params: { matchId: r.matchId, userId: card.id } });
      }
    } catch (e: any) {
      // Put the card back so nothing is lost when a like didn't go through.
      setExtra((ex) => [card, ...ex]);
      haptic.warning();
      setNotice({ tone: e.code === "daily_limit" ? "warn" : "alert", text: e.code === "daily_limit" ? "That's today's likes. New people tomorrow — or polish your profile meanwhile." : e.message, premium: e.code === "daily_limit" });
    }
  }

  async function undo() {
    if (!lastPassed) return;
    try {
      await api("/api/likes/undo", { method: "POST" });
      haptic.light();
      setExtra((ex) => [lastPassed, ...ex]);
      setLastPassed(null);
    } catch (e: any) { setNotice({ tone: "alert", text: e.message }); setLastPassed(null); }
  }

  async function block(card: Card) {
    setOptions(null);
    await api("/api/blocks", { body: { userId: card.id } }).catch(() => {});
    if (top?.id === card.id) advance();
    setNotice({ tone: "trust", text: `${card.firstName} is blocked. You won't see each other again.` });
  }

  const remaining = cards.length;
  const verifyNudge = me?.user.selfieStatus === "NONE";

  return (
    <Screen pad={false}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 6, gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T v="title">Discover</T>
          <T v="caption" tone="muted">{q.data ? (remaining ? `People you might click with · ${remaining} here` : "You're all caught up") : "Finding people you might click with"}</T>
        </View>
        <View>
          <IconButton icon="bell" label={me?.unreadNotifications ? `Notifications, ${me.unreadNotifications} new` : "Notifications"} size={44} onPress={() => router.push("/notifications")} />
          {!!me?.unreadNotifications && <View style={{ position: "absolute", right: 8, top: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: c.alert, borderWidth: 2, borderColor: c.surface }} />}
        </View>
        <IconButton icon="sliders" label="Preferences" size={44} onPress={() => router.push("/preferences")} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 12 }}>
        {MODES.map(([k, l]) => <Chip key={k} label={l} selected={mode === k} onPress={() => setMode(k)} />)}
      </ScrollView>

      {notice && (
        <Animated.View entering={FadeInDown} style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <Banner tone={notice.tone} onPress={notice.premium ? () => router.push("/premium") : () => setNotice(null)}>
            <T v="callout">{notice.text}{notice.premium ? "  See Premium" : ""}</T>
          </Banner>
        </Animated.View>
      )}

      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        {q.isLoading && <Skeleton h={600} r={28} style={{ flex: 1 }} />}
        {q.error && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && !top && (
          <Animated.View entering={FadeIn} style={{ flex: 1, justifyContent: "center" }}>
            <EmptyState art="door" title="You've met everyone here for now" body="Try another tab above, widen your distance or age range, or check back tomorrow — new people join every day."
              action={{ label: "Adjust preferences", onPress: () => router.push("/preferences") }} />
          </Animated.View>
        )}
        {top && (
          <CardDeck ref={deck} top={top} next={next} x={x}
            onDecision={(d, card) => decide(d, card)}
            onOpen={(card) => router.push({ pathname: "/profile/[id]", params: { id: card.id } })}
            onOptions={(card) => setOptions(card)} />
        )}
      </View>

      {top && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 20 }}>
          <IconButton icon="undo" label="Undo last pass" size={44} disabled={!lastPassed} onPress={undo} />
          <IconButton icon="pass" label={`Pass on ${top.firstName}`} size={60} onPress={() => deck.current?.swipe("PASS")} />
          <IconButton icon="star" label={`Priority like with a note to ${top.firstName}`} size={52} iconColor={c.accent} onPress={() => { setNote(top.shared[0] ? `You're into ${top.shared[0].label.toLowerCase()} too — ` : ""); setNoteFor(top); }} />
          <Button title="Like" v="accent" size="lg" icon="likes" onPress={() => deck.current?.swipe("LIKE")} style={{ flex: 1, maxWidth: 160 }} />
        </View>
      )}

      {verifyNudge && top && index === 3 && (
        <Animated.View entering={FadeIn} style={{ position: "absolute", left: 20, right: 20, top: 120 }}>
          <Banner tone="trust" onPress={() => router.push("/safety")}><T v="callout">Verified profiles get more likes. Tap to get your ring.</T></Banner>
        </Animated.View>
      )}

      <BottomSheet open={!!options} onClose={() => setOptions(null)} title={options ? options.firstName : undefined}>
        {options && (
          <>
            <SheetAction label="View full profile" icon={<Icon name="eye" />} onPress={() => { const o = options; setOptions(null); router.push({ pathname: "/profile/[id]", params: { id: o.id } }); }} />
            <SheetAction label="Not for me" icon={<Icon name="pass" />} onPress={() => { setOptions(null); deck.current?.swipe("PASS"); }} />
            <SheetAction label={`Report ${options.firstName}`} tone="alert" icon={<Icon name="flag" color={c.alert} />} onPress={() => { const o = options; setOptions(null); router.push({ pathname: "/report", params: { userId: o.id, name: o.firstName } }); }} />
            <SheetAction label={`Block ${options.firstName}`} tone="alert" icon={<Icon name="block" color={c.alert} />} onPress={() => block(options)} />
          </>
        )}
      </BottomSheet>

      <BottomSheet open={!!noteFor} onClose={() => setNoteFor(null)} title={noteFor ? `Priority like for ${noteFor.firstName}` : undefined}>
        <T tone="muted">Your note lands at the top of their likes. Mention something from their profile.</T>
        <TextInput value={note} onChangeText={setNote} maxLength={200} multiline autoFocus accessibilityLabel="Your note"
          style={{ minHeight: 96, borderRadius: 16, backgroundColor: c.raised, padding: 14, fontSize: 17, color: c.text, fontFamily: "Figtree_500Medium", textAlignVertical: "top" }} />
        <T v="caption" tone="faint">{me?.features.dailyPriorityLikes ?? 1} a day on your plan · {200 - note.length} characters left</T>
        <Button title="Send priority like" v="accent" size="lg" full icon="star"
          onPress={() => { const card = noteFor!; setNoteFor(null); haptic.success(); decide("PRIORITY", card, note.trim()); }} />
      </BottomSheet>
    </Screen>
  );
}
