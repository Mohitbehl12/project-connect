import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Switch, View } from "react-native";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, type IconName } from "./Icon";
import { T } from "./Text";

export function Group({ title, children, foot }: { title: string; children: ReactNode; foot?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <T v="callout" tone="muted">{title}</T>
      <View style={{ backgroundColor: c.surface, borderRadius: 20, paddingHorizontal: 16 }}>{children}</View>
      {foot ? <T v="caption" tone="faint">{foot}</T> : null}
    </View>
  );
}

export function Toggle({ label, sub, value, onChange, disabled }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <T v="headline" style={{ fontFamily: "Figtree_600SemiBold" }}>{label}</T>
        {sub ? <T v="caption" tone="muted">{sub}</T> : null}
      </View>
      <Switch value={value} disabled={disabled} onValueChange={(v) => { haptic.tick(); onChange(v); }} trackColor={{ true: c.trust, false: c.line }} accessibilityLabel={label} />
    </View>
  );
}

export function LinkRow({ icon, label, sub, href, onPress, tone }: { icon: IconName; label: string; sub?: string; href?: string; onPress?: () => void; tone?: "alert" }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={() => { haptic.tick(); onPress ? onPress() : href && router.push(href as any); }}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: tone === "alert" ? c.alertWash : c.raised, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={20} color={tone === "alert" ? c.alert : c.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="headline" style={{ fontFamily: "Figtree_600SemiBold", color: tone === "alert" ? c.alert : c.text }}>{label}</T>
        {sub ? <T v="caption" tone="muted">{sub}</T> : null}
      </View>
      <Icon name="forward" size={18} color={c.faint} />
    </Pressable>
  );
}
