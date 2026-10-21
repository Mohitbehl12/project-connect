import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from "@expo-google-fonts/figtree";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { IncomingCall } from "@/components/IncomingCall";
import { FxLayer } from "@/components/FxLayer";
import { FxProvider } from "@/lib/fx";
import { StoreBridge } from "@/components/StoreBridge";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e: any) => n < 2 && (e?.status ?? 0) >= 500, staleTime: 60_000, refetchOnWindowFocus: false },
  },
});

function Shell() {
  const { c, dark } = useTheme();
  useEffect(() => { SystemUI.setBackgroundColorAsync(c.bg).catch(() => {}); }, [c.bg]);
  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: "slide_from_right" }}>
        <Stack.Screen name="index" options={{ animation: "fade" }} />
        <Stack.Screen name="welcome" options={{ animation: "fade" }} />
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
        <Stack.Screen name="profile/[id]" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="compatibility/[id]" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="match" options={{ presentation: "transparentModal", animation: "fade" }} />
        <Stack.Screen name="report" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="date/[matchId]" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="premium" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="call/[id]" options={{ animation: "fade", gestureEnabled: false }} />
      </Stack>
      <IncomingCall />
      <FxLayer />
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold,
  });
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync().catch(() => {}); }, [loaded, error]);
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <FxProvider>
              <AuthProvider>
                <Shell />
                <StoreBridge />
              </AuthProvider>
            </FxProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
