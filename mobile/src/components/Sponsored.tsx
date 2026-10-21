import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { BottomSheet, SheetAction } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { API_URL, api, mediaUrl } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

// Sponsored content. Ads are always labelled "Sponsored" in gold, show a business (never a person's
// first name or age), and are never shown inside a chat or during a call. Advertisers only get totals.

export type Ad = {
  id: string; token: string; placement: string; label: string; headline: string; description: string; cta: string;
  advertiser: { name: string; verified: boolean; trusted?: boolean };
  logo: string | null; images: string[]; video: string | null; hasLink: boolean; why: string; every?: number;
};
export type Placement = "DISCOVER" | "FEED" | "STORY" | "BANNER" | "RECOMMENDATION";

const GOLD = "#A5781F";
const REASONS: [string, string][] = [["MISLEADING", "Misleading"], ["SCAM", "Scam"], ["OFFENSIVE", "Offensive"], ["INAPPROPRIATE", "Inappropriate"], ["FAKE_BUSINESS", "Fake business"], ["DANGEROUS", "Dangerous"], ["MISMATCH", "Doesn't match the website"], ["OTHER", "Other"]];

/** One ad for a placement, or null. Refreshes at most every few minutes so ads stay light. */
export function useAd(placement: Placement, enabled = true, exclude: string[] = []) {
  return useQuery({
    queryKey: ["ad", placement, exclude.join(",")],
    queryFn: () => api<{ ad: Ad | null }>(`/api/ads/serve?placement=${placement}${exclude.length ? `&exclude=${exclude.join(",")}` : ""}`).then((r) => r.ad).catch(() => null),
    staleTime: 5 * 60_000, enabled,
  });
}

function track(ad: Ad, kind: "IMPRESSION" | "VIDEO_VIEW") {
  api("/api/ads/events", { body: { token: ad.token, kind }, auth: false }).catch(() => {});
}
async function openAd(ad: Ad) {
  if (!ad.hasLink) return;
  haptic.light();
  await WebBrowser.openBrowserAsync(`${API_URL}/api/ads/click?t=${encodeURIComponent(ad.token)}`).catch(() => {});
}

function AdVideo({ uri, onPlay, height }: { uri: string; onPlay: () => void; height: number }) {
  const player = useVideoPlayer(uri, (p) => { p.muted = true; p.loop = true; });
  const sent = useRef(false);
  useEffect(() => {
    const sub = player.addListener("playingChange", ({ isPlaying }) => { if (isPlaying && !sent.current) { sent.current = true; onPlay(); } });
    return () => sub.remove();
  }, [player, onPlay]);
  return <VideoView player={player} style={{ width: "100%", height, backgroundColor: "#000" }} nativeControls contentFit="cover" />;
}

/** The ⋯ sheet every ad has: hide, report, why, and preferences. */
export function AdOptions({ ad, open, onClose, onGone }: { ad: Ad; open: boolean; onClose: () => void; onGone: (msg: string) => void }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"menu" | "why" | "report">("menu");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setMode("menu"); setReason(""); setDetails(""); setErr(""); } }, [open]);
  const gone = (m: string) => { qc.removeQueries({ queryKey: ["ad"] }); onClose(); onGone(m); };
  return (
    <BottomSheet open={open} onClose={onClose} title={mode === "report" ? "Report ad" : mode === "why" ? "Why am I seeing this?" : `Sponsored · ${ad.advertiser.name}`}>
      {mode === "menu" && (
        <>
          <SheetAction label="Hide this ad" icon={<Icon name="eye" />} onPress={async () => { await api(`/api/ads/${ad.id}/hide`, { method: "POST" }).catch(() => {}); gone("Ad hidden. You won't see it again."); }} />
          <SheetAction label="Report ad" tone="alert" icon={<Icon name="flag" color={c.alert} />} onPress={() => setMode("report")} />
          <SheetAction label="Why am I seeing this?" icon={<Icon name="sparkle" />} onPress={() => setMode("why")} />
          <SheetAction label="Manage ad preferences" icon={<Icon name="sliders" />} onPress={() => { onClose(); router.push("/privacy"); }} />
        </>
      )}
      {mode === "why" && (
        <>
          <T>{ad.why}</T>
          {ad.advertiser.verified && <T v="caption" tone="muted">"{ad.advertiser.trusted ? "Trusted advertiser" : "Verified business"}" means we checked who this business is. It isn't a guarantee of its products or services.</T>}
          <Button title="Manage ad preferences" v="outline" full onPress={() => { onClose(); router.push("/privacy"); }} />
        </>
      )}
      {mode === "report" && (
        <>
          {REASONS.map(([k, l]) => (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: reason === k }} onPress={() => setReason(k)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: reason === k ? c.brand : c.line, alignItems: "center", justifyContent: "center" }}>
                {reason === k && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.brand }} />}
              </View>
              <T>{l}</T>
            </Pressable>
          ))}
          <TextInput value={details} onChangeText={setDetails} placeholder="Anything else? (optional)" placeholderTextColor={c.faint} maxLength={1000} multiline accessibilityLabel="Details"
            style={{ minHeight: 70, borderRadius: 14, backgroundColor: c.raised, padding: 12, color: c.text, fontFamily: "Figtree_500Medium", textAlignVertical: "top" }} />
          {!!err && <T tone="alert">{err}</T>}
          <Button title="Send report" full disabled={!reason} onPress={async () => {
            try { const r = await api<{ message: string }>(`/api/ads/${ad.id}/report`, { body: { reason, details } }); haptic.success(); gone(r.message); } catch (e: any) { setErr(e.message); }
          }} />
        </>
      )}
    </BottomSheet>
  );
}

/** Sponsored card used in Discover, the Explore feed and recommendations. `compact` is the small banner. */
export function SponsoredCard({ ad, compact, tall, onGone }: { ad: Ad; compact?: boolean; tall?: boolean; onGone?: (msg: string) => void }) {
  const { c } = useTheme();
  const [menu, setMenu] = useState(false);
  const [slide, setSlide] = useState(0);
  useEffect(() => { track(ad, "IMPRESSION"); }, [ad.token]);
  const img = mediaUrl(ad.images[slide]);
  const mediaH = compact ? 96 : tall ? 360 : 200;
  return (
    <View accessibilityLabel={`Sponsored by ${ad.advertiser.name}`} style={{ borderRadius: 22, overflow: "hidden", backgroundColor: c.surface, borderWidth: 1, borderColor: "#E9C37A88" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }}>
        {ad.logo ? <Image source={{ uri: mediaUrl(ad.logo) }} style={{ width: 34, height: 34, borderRadius: 9 }} accessibilityIgnoresInvertColors />
          : <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: c.raised, alignItems: "center", justifyContent: "center" }}><T strong>{ad.advertiser.name.slice(0, 1)}</T></View>}
        <View style={{ flex: 1 }}>
          <T v="callout" strong numberOfLines={1}>{ad.advertiser.name}{ad.advertiser.verified ? "  ✓" : ""}</T>
          <T v="caption" strong style={{ color: GOLD, letterSpacing: 1 }}>SPONSORED</T>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Ad options" hitSlop={12} onPress={() => setMenu(true)} style={{ padding: 6 }}><Icon name="more" /></Pressable>
      </View>
      {ad.video ? <AdVideo uri={mediaUrl(ad.video)!} height={mediaH} onPlay={() => track(ad, "VIDEO_VIEW")} />
        : img ? (
          <Pressable accessibilityRole="link" accessibilityLabel={ad.headline} onPress={() => openAd(ad)} onLongPress={() => ad.images.length > 1 && setSlide((slide + 1) % ad.images.length)}>
            <Image source={{ uri: img }} style={{ width: "100%", height: mediaH }} contentFit="cover" accessibilityIgnoresInvertColors />
            {ad.images.length > 1 && (
              <View style={{ position: "absolute", bottom: 8, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 }}>
                {ad.images.map((_, i) => <Pressable key={i} accessibilityLabel={`Image ${i + 1}`} hitSlop={8} onPress={() => setSlide(i)} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === slide ? "#FFF" : "#FFFFFF88" }} />)}
              </View>
            )}
          </Pressable>
        ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }}>
        <View style={{ flex: 1 }}>
          <T v="headline" numberOfLines={2}>{ad.headline}</T>
          {!compact && !!ad.description && <T v="caption" tone="muted" numberOfLines={3}>{ad.description}</T>}
        </View>
        {ad.hasLink && <Button title={ad.cta} onPress={() => openAd(ad)} />}
      </View>
      <AdOptions ad={ad} open={menu} onClose={() => setMenu(false)} onGone={(m) => onGone?.(m)} />
    </View>
  );
}

/** A placement that renders nothing when there is no ad, and a one-line notice after hide/report. */
export function SponsoredSlot({ placement, compact, style, after }: { placement: Exclude<Placement, "STORY" | "DISCOVER">; compact?: boolean; style?: object; after?: Exclude<Placement, "STORY" | "DISCOVER"> }) {
  // `after`: wait for another slot on the same screen and never repeat its ad.
  const first = useAd(after ?? placement, !!after);
  const q = useAd(placement, !after || first.isFetched, after && first.data ? [first.data.id] : []);
  const [msg, setMsg] = useState("");
  const { c } = useTheme();
  if (msg) return <View style={[{ padding: 12, borderRadius: 14, backgroundColor: c.raised }, style]}><T v="caption" tone="muted">{msg}</T></View>;
  if (!q.data) return null;
  return <View style={style}><SponsoredCard ad={q.data} compact={compact} onGone={setMsg} /></View>;
}

/** Story placement: a tile that opens a full-screen vertical ad with an obvious close button. */
export function SponsoredStoryTile() {
  const q = useAd("STORY");
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [gone, setGone] = useState(false);
  const ad = q.data;
  useEffect(() => { if (ad && open) track(ad, "IMPRESSION"); }, [open, ad?.token]);
  if (!ad || gone) return null;
  const img = mediaUrl(ad.images[0]);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Sponsored story from ${ad.advertiser.name}`} onPress={() => setOpen(true)}
        style={{ width: 132, height: 200, borderRadius: 26, overflow: "hidden", backgroundColor: "#1A0810", borderWidth: 1.5, borderColor: "#E9C37A" }}>
        {img && <Image source={{ uri: img }} style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.75 }} contentFit="cover" />}
        <View style={{ flex: 1, padding: 12, justifyContent: "space-between" }}>
          <View style={{ alignSelf: "flex-start", backgroundColor: "#E9C37A", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}><T v="caption" strong style={{ color: "#3B2608" }}>Sponsored</T></View>
          <T v="callout" tone="white" strong numberOfLines={2}>{ad.advertiser.name}</T>
        </View>
      </Pressable>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {ad.video ? <View style={{ flex: 1, justifyContent: "center" }}><AdVideo uri={mediaUrl(ad.video)!} height={640} onPlay={() => track(ad, "VIDEO_VIEW")} /></View>
            : img ? <Image source={{ uri: img }} style={{ flex: 1 }} contentFit="contain" /> : <View style={{ flex: 1 }} />}
          <View style={{ position: "absolute", top: 48, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ backgroundColor: "#E9C37A", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><T v="caption" strong style={{ color: "#3B2608" }}>Sponsored</T></View>
            <T tone="white" strong style={{ flex: 1 }} numberOfLines={1}>{ad.advertiser.name}</T>
            <Pressable accessibilityRole="button" accessibilityLabel="Ad options" hitSlop={12} onPress={() => setMenu(true)}><Icon name="more" color="#FFF" /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Close ad" hitSlop={12} onPress={() => setOpen(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFFFFF33", alignItems: "center", justifyContent: "center" }}><Icon name="close" color="#FFF" /></Pressable>
          </View>
          <ScrollView style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: 260 }} contentContainerStyle={{ padding: 20, paddingBottom: 44, gap: 10, backgroundColor: "#000000AA" }}>
            <T v="title" tone="white">{ad.headline}</T>
            {!!ad.description && <T tone="white" style={{ opacity: 0.85 }}>{ad.description}</T>}
            {ad.hasLink && <Button title={ad.cta} full onPress={() => openAd(ad)} />}
          </ScrollView>
        </View>
        <AdOptions ad={ad} open={menu} onClose={() => setMenu(false)} onGone={() => { setOpen(false); setGone(true); }} />
      </Modal>
    </>
  );
}
