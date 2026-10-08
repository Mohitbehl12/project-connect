import { Redirect, Tabs, router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { registerForPush } from "@/lib/push";
import { TabBar } from "@/components/TabBar";
import { useAuth } from "@/lib/auth";

export default function TabsLayout() {
  const { status, me } = useAuth();
  useEffect(() => { if (status === "signedIn") registerForPush(); }, [status]);
  // Tapping a push opens the right screen (links use the web paths the server stores).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = r.notification.request.content.data?.link as string | undefined;
      const m = link?.match(/^\/matches\/([\w-]+)/);
      if (m) router.push({ pathname: "/chat/[id]", params: { id: m[1] } });
      else if (link?.startsWith("/likes")) router.push("/likes");
    });
    return () => sub.remove();
  }, []);
  if (status === "signedOut") return <Redirect href="/welcome" />;
  if (me && me.user.onboardingStep < 3) return <Redirect href="/onboarding" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, animation: "fade" }}>
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="likes" />
      <Tabs.Screen name="matches" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
