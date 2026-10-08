import { router } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { IconButton } from "./Button";
import { T } from "./Text";

/** Pushed-screen header: back button, large title underneath (one-handed: content starts low). */
export function Header({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <View style={{ paddingTop: 2, paddingBottom: 10, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -10 }}>
        <IconButton icon="back" label="Back" tone="none" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        {right}
      </View>
      <T v="title">{title}</T>
      {sub ? <T tone="muted">{sub}</T> : null}
    </View>
  );
}
