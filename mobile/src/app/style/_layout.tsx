import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth";
import { StyleProvider } from "@/style/StyleContext";
import { useTheme } from "@/theme/ThemeProvider";

export default function StyleLayout() {
  const { status } = useAuth();
  const { c } = useTheme();
  if (status === "signedOut") return <Redirect href="/welcome" />;
  return (
    <StyleProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: "slide_from_right" }}>
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
      </Stack>
    </StyleProvider>
  );
}
