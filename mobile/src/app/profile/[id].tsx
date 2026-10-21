import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { CompatArc } from "@/components/Arc";
import { Button, IconButton } from "@/components/Button";
import { Icon, VerifiedBadge } from "@/components/Icon";
import { T } from "@/components/Text";
import { Chip, ErrorState, PhotoView, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { Bars } from "@/components/CompatBars";
import { cardCache } from "@/lib/cardCache";
import type { Card, Compatibility } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10, paddingHorizontal: 20 }}>
      <T v="headline">{title}</T>
      {children}
    </View>
  );
}

/** Immersive profile: gallery, compatibility up front, then the person in their own words. */
export default function ProfileSheet() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const [callNote, setCallNote] = useState("");
  const { c, g } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cached = cardCache.get(id);
  // Opened from a link, a notification or after a restart: load the card from the server.
  const remote = useQuery({ queryKey: ["person", id], enabled: !cached, retry: false, queryFn: () => api<{ card: Card }>(`/api/people/${id}`) });
  const card = cached ?? remote.data?.card;
  const compat = useQuery({ queryKey: ["compat", id], queryFn: () => api<Compatibility>(`/api/compatibility/${id}`) });
  const [page, setPage] = useState(0);

  if (!card && remote.isLoading) return <View style={{ flex: 1, backgroundColor: c.bg, padding: 20, paddingTop: insets.top + 20 }}><Skeleton h={480} r={28} /></View>;
  if (!card) return <ErrorState message="This profile isn't available any more." onRetry={() => router.back()} />;
  const h = width * 1.3;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120, gap: 24 }}>
        <View>
          <FlatList data={card.photos.length ? card.photos : [null]} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            keyExtractor={(p, i) => p?.id ?? `none-${i}`}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => <PhotoView photo={item} style={{ width, height: h }} />} />
          <View style={{ position: "absolute", top: insets.top + 8, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between" }}>
            <IconButton icon="close" label="Close profile" tone="glass" size={44} onPress={() => router.back()} />
            <IconButton icon="shield" label="Safety options" tone="glass" size={44} onPress={() => router.push({ pathname: "/report", params: { userId: card.id, name: card.firstName } })} />
          </View>
          <LinearGradient pointerEvents="none" colors={["rgba(22,17,42,0.5)", "transparent"]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: insets.top + 90 }} />
          <LinearGradient pointerEvents="none" colors={["transparent", "rgba(12,11,30,0.88)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h * 0.42 }} />
          <View pointerEvents="none" style={{ position: "absolute", left: 20, right: 20, bottom: 30, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <T v="display" tone="white" style={{ fontSize: 42, lineHeight: 46, flexShrink: 1 }} numberOfLines={1}>{card.firstName}<T tone="white" style={{ fontFamily: "BricolageGrotesque_700Bold", fontSize: 32, lineHeight: 46, opacity: 0.92 }}>  {card.age}</T></T>
              {card.verified && <VerifiedBadge size={26} />}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="pin" size={16} color="rgba(255,255,255,0.85)" />
              <T tone="white" style={{ opacity: 0.88 }}>{card.city} · {card.distance}</T>
            </View>
          </View>
          {card.photos.length > 1 && (
            <View style={{ position: "absolute", bottom: 12, alignSelf: "center", flexDirection: "row", gap: 6 }}>
              {card.photos.map((p, i) => <View key={p.id} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? "#FFF" : "rgba(255,255,255,0.5)" }} />)}
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: -8 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Chip small label={card.intent} tone="accent" />
            {[card.profession, card.education, card.heightCm ? `${card.heightCm} cm` : null].filter(Boolean).map((f) => <Chip small key={f!} label={f!} />)}
          </View>
        </View>

        {card.likeNote && (
          <View style={{ marginHorizontal: 20, backgroundColor: c.accentWash, borderRadius: 20, padding: 16, gap: 4 }}>
            <T v="caption" tone="muted">{card.firstName}'s note to you</T>
            <T v="headline">“{card.likeNote}”</T>
          </View>
        )}

        <Pressable accessibilityRole="button" accessibilityLabel="See full compatibility breakdown" onPress={() => router.push({ pathname: "/compatibility/[id]", params: { id: card.id } })}
          style={{ marginHorizontal: 20, backgroundColor: c.surface, borderRadius: 26, padding: 18, gap: 16, shadowColor: c.brand, shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3, borderWidth: 1, borderColor: c.line }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <CompatArc score={compat.data?.overall ?? card.score ?? 0} size={76} caption="Chemistry" />
            <View style={{ flex: 1, gap: 4 }}>
              <T v="headline">Why you might click</T>
              {(card.reasons ?? []).slice(0, 2).map((r) => <T key={r} v="callout" tone="muted">✓ {r}</T>)}
            </View>
          </View>
          {compat.isLoading ? <Skeleton h={96} /> : compat.data ? <Bars data={compat.data} limit={3} /> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <T v="callout" tone="brand">See full breakdown</T><Icon name="forward" size={18} color={c.brand} />
          </View>
        </Pressable>

        {card.morePhotosForMatches ? <T v="caption" tone="muted" style={{ marginHorizontal: 20 }}>{card.firstName} shares more photos with matches.</T> : null}
        {card.bio ? <Section title="About me"><T>{card.bio}</T></Section> : null}

        {card.prompts.map((p) => (
          <View key={p.q} style={{ marginHorizontal: 20, borderLeftWidth: 3, borderLeftColor: c.accent, paddingLeft: 14, gap: 2 }}>
            <T v="caption" tone="muted">{p.q}</T>
            <T v="title" style={{ fontSize: 22, lineHeight: 27 }}>{p.a}</T>
          </View>
        ))}

        {card.shared.length > 0 && (
          <Section title="You both love">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{card.shared.map((s) => <Chip key={s.key} label={s.label} emoji={s.emoji} tone="shared" />)}</View>
          </Section>
        )}
        {card.interests.length > card.shared.length && (
          <Section title="Also into">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {card.interests.filter((i) => !card.shared.some((s) => s.label === i)).map((i) => <Chip key={i} label={i} />)}
            </View>
          </Section>
        )}
        {(compat.data?.connect.length ?? 0) > 0 && (
          <Section title="How you two connect">
            {compat.data!.connect.map((t) => <T key={t} tone="muted">• {t}</T>)}
          </Section>
        )}
        {!!card.languages?.length && (
          <Section title="Speaks">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{card.languages.map((l) => <Chip key={l} label={l} />)}</View>
          </Section>
        )}
        {card.lifestyle.length > 0 && (
          <Section title="Lifestyle">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{card.lifestyle.map((l) => <Chip key={l} label={l} />)}</View>
          </Section>
        )}
        {from === "match" && (
          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            <Button title={callNote ? "Request sent 📞" : "Request a Call 📞"} icon="video" disabled={!!callNote} onPress={async () => {
              try {
                await api("/api/call-requests", { body: { userId: card.id, kind: "VIDEO" } });
                setCallNote(`Request sent. You can call once ${card.firstName} accepts — we'll let you know.`);
              } catch (e: any) { setCallNote(e.message); }
            }} />
            {callNote ? <T v="callout" tone="muted" center>{callNote}</T> : <T v="caption" tone="faint" center>{card.firstName} decides: nobody is called without accepting first.</T>}
          </View>
        )}
        <View style={{ paddingHorizontal: 20 }}>
          <Button title={`Report or block ${card.firstName}`} v="ghost" icon="flag" onPress={() => router.push({ pathname: "/report", params: { userId: card.id, name: card.firstName } })} />
        </View>
      </ScrollView>

      {from !== "match" && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: c.tab, borderTopWidth: 1, borderTopColor: c.line }}>
          <Button title="Not for me" v="outline" style={{ flex: 1 }} onPress={() => router.back()} />
          <Button title="Like" v="accent" icon="likes" style={{ flex: 1 }} onPress={async () => {
            router.back();
            try {
              const r = await api<{ matched: boolean; matchId: string | null }>("/api/likes", { body: { toId: card.id, kind: "LIKE" } });
              if (r.matched && r.matchId) router.push({ pathname: "/match", params: { matchId: r.matchId, userId: card.id } });
            } catch { /* surfaced on Discover */ }
          }} />
        </View>
      )}
    </View>
  );
}
