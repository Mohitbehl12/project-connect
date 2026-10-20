import { Tabs } from "expo-router";
import { TabBar } from "@/components/TabBar";
import { STYLE_ACCENT } from "@/style/StyleHeader";

const STYLE_TABS = {
  index: { label: "Shop", icon: "shirt" as const },
  design: { label: "Design", icon: "scissors" as const },
  measure: { label: "Measure", icon: "ruler" as const },
  orders: { label: "Orders", icon: "bag" as const },
};

export default function StyleTabs() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} tabs={STYLE_TABS} accent={STYLE_ACCENT} />} screenOptions={{ headerShown: false, animation: "fade" }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="design" />
      <Tabs.Screen name="measure" />
      <Tabs.Screen name="orders" />
    </Tabs>
  );
}
