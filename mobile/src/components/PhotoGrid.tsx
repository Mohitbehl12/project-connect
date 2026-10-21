import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { appendPhoto } from "@/lib/photoFile";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import type { MyPhoto } from "@/lib/types";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "./Icon";
import { T } from "./Text";
import { Banner, PhotoView } from "./ui";

/** Add, crop, reorder (make primary), delete — with friendly quality hints after each upload. */
export function PhotoGrid({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const { data } = useQuery({ queryKey: ["photos"], queryFn: () => api<{ photos: MyPhoto[]; max: number }>("/api/photos") });
  const [uploading, setUploading] = useState(false);
  const [hint, setHint] = useState<{ tone: "trust" | "warn" | "alert"; text: string } | null>(null);
  const photos = data?.photos ?? [];
  const max = data?.max ?? 6;
  const gap = 10;
  const cell = Math.floor((Math.min(width, 520) - 40 - gap * 2) / 3);

  const refresh = async () => {
    const r = await qc.fetchQuery({ queryKey: ["photos"], queryFn: () => api<{ photos: MyPhoto[]; max: number }>("/api/photos") });
    onCountChange?.(r.photos.length);
    qc.invalidateQueries({ queryKey: ["me"] });
  };

  async function add() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setHint({ tone: "alert", text: "Allow photo access in Settings to add photos." }); return; }
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 0.85 });
    if (pick.canceled || !pick.assets[0]) return;
    const asset = pick.assets[0];
    setUploading(true); setHint(null);
    try {
      const form = new FormData();
      await appendPhoto(form, asset);
      const r = await api<{ photo: MyPhoto }>("/api/photos", { form });
      haptic.success();
      setHint({ tone: r.photo.status === "PENDING" ? "trust" : r.photo.quality === "GOOD" ? "trust" : "warn", text: r.photo.hint });
      await refresh();
    } catch (e: any) {
      haptic.warning();
      setHint({ tone: "alert", text: e.message });
    } finally {
      setUploading(false);
    }
  }

  async function makePrimary(p: MyPhoto) {
    const order = [p.id, ...photos.filter((x) => x.id !== p.id).map((x) => x.id)];
    await api("/api/photos", { method: "PATCH", body: { order } });
    haptic.light();
    await refresh();
  }
  async function remove(p: MyPhoto) {
    await api(`/api/photos/${p.id}`, { method: "DELETE" });
    await refresh();
  }

  function options(p: MyPhoto, index: number) {
    haptic.medium();
    const actions = [index > 0 ? "Make main photo" : null, "Remove photo", "Cancel"].filter(Boolean) as string[];
    const run = (label: string) => { if (label === "Make main photo") makePrimary(p); if (label === "Remove photo") remove(p); };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options: actions, destructiveButtonIndex: actions.indexOf("Remove photo"), cancelButtonIndex: actions.length - 1 }, (i) => run(actions[i]));
    } else if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (index > 0 && globalThis.confirm?.("Make this your main photo? (Cancel to remove it instead)")) makePrimary(p);
      else if (globalThis.confirm?.("Remove this photo?")) remove(p);
    } else {
      Alert.alert("Photo", undefined, actions.map((a) => ({ text: a, style: a === "Remove photo" ? "destructive" : a === "Cancel" ? "cancel" : "default", onPress: () => run(a) })));
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
        {Array.from({ length: max }).map((_, i) => {
          const p = photos[i];
          return (
            <View key={p?.id ?? `empty-${i}`} style={{ width: cell, height: cell * 1.33 }}>
              {p ? (
                <Animated.View entering={ZoomIn.duration(220)} style={{ flex: 1 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}${i === 0 ? ", main photo" : ""}. Double tap for options.`}
                    onPress={() => options(p, i)} onLongPress={() => options(p, i)} style={{ flex: 1 }}>
                    <PhotoView photo={p} rounded={18} style={{ flex: 1 }} />
                    {i === 0 && (
                      <View style={{ position: "absolute", left: 8, bottom: 8, backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <T v="caption" style={{ color: c.brandText }}>Main</T>
                      </View>
                    )}
                    {p.status === "PENDING" && (
                      <View style={{ position: "absolute", left: 8, right: 8, top: 8, backgroundColor: c.scrim, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <T v="caption" style={{ color: "#FFFFFF" }} center>Being checked</T>
                      </View>
                    )}
                    {p.status !== "PENDING" && p.quality !== "GOOD" && (
                      <View style={{ position: "absolute", right: 8, top: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
                        <T v="caption" style={{ color: c.accentText, fontFamily: "Figtree_700Bold" }}>!</T>
                      </View>
                    )}
                  </Pressable>
                </Animated.View>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" disabled={uploading || i !== photos.length} onPress={add}
                  style={{ flex: 1, borderRadius: 18, borderWidth: 2, borderStyle: "dashed", borderColor: i === photos.length ? c.brand : c.line, alignItems: "center", justifyContent: "center", backgroundColor: c.surface }}>
                  {uploading && i === photos.length ? <ActivityIndicator color={c.brand} /> : <Icon name="plus" color={i === photos.length ? c.brand : c.faint} size={28} />}
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
      {hint && <Animated.View entering={FadeIn}><Banner tone={hint.tone}>{hint.text}</Banner></Animated.View>}
      <T v="caption" tone="faint">Tap a photo to make it your main one or remove it. Photos where your face is clear and well lit get the most likes. Only add photos of you that you have the right to share (see our Terms); location data is removed and every photo is checked for nudity and violence.</T>
    </View>
  );
}
