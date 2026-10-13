import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { T } from "./Text";

/** Lightweight in-screen bottom sheet (options, notes, confirmations). Full screens use route modals. */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View entering={FadeIn.duration(180)} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.overlay }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View entering={SlideInDown.duration(260)} accessibilityViewIsModal
          style={{ backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8, gap: 14 }}>
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
          {title && <T v="headline">{title}</T>}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetAction({ label, icon, tone = "text", onPress }: { label: string; icon?: ReactNode; tone?: "text" | "alert"; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingHorizontal: 4, borderRadius: 14, backgroundColor: pressed ? c.raised : "transparent" })}>
      {icon}
      <T v="headline" style={{ color: tone === "alert" ? c.alert : c.text, fontFamily: "Figtree_600SemiBold" }}>{label}</T>
    </Pressable>
  );
}
