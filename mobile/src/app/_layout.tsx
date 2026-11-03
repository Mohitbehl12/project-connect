import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import { Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from "@expo-google-fonts/figtree";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { IncomingCall } from "@/components/IncomingCall";
import { FxLayer } from "@/components/FxLayer";
import { FxProvider } from "@/lib/fx";
import { StoreBridge } from "@/components/StoreBridge";
import { AuthProvider } from "@/lib/auth";
import { installCrashReporter, reportError, setCrashScreen } from "@/lib/crashReporter";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});
installCrashReporter();

/** Expo Router shows this when a screen crashes; the crash goes to the monitor and the person can retry. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => { reportError(error, "crash"); }, [error]);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "#0F0709", gap: 14 }}>
      <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "800", textAlign: "center" }}>Something went wrong</Text>
      <Text style={{ color: "#CBB8C2", fontSize: 16, textAlign: "center" }}>We've been told about it automatically. Try again — if it keeps happening, come back in a few minutes.</Text>
      <Pressable accessibilityRole="button" onPress={() => { retry().catch(() => {}); }} style={{ marginTop: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28, backgroundColor: "#E9C37A" }}>
        <Text style={{ color: "#3B2608", fontSize: 16, fontWeight: "700" }}>Try again</Text>
      </Pressable>
    </View>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e: any) => n < 2 && (e?.status ?? 0) >= 500, staleTime: 60_000, refetchOnWindowFocus: false },
  },
});

function Shell() {
  const { c, dark } = useTheme();
  useEffect(() => { SystemUI.setBackgroundColorAsync(c.bg).catch(() => {}); }, [c.bg]);
  const path = usePathname();
  useEffect(() => { setCrashScreen(path); }, [path]);
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
        <Stack.Screen name="search" options={{ presentation: "fullScreenModal", animation: "fade_from_bottom" }} />
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
