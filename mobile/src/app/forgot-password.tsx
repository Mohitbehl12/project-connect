import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button, IconButton } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, Field, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

/** Asks for a reset link by email. The link opens a secure web page where the new password is set. */
export default function ForgotPassword() {
  const { c } = useTheme();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ message: string; devResetUrl?: string } | null>(null);

  async function submit() {
    setBusy(true); setErr("");
    try {
      setDone(await api("/api/auth/forgot", { body: { email: email.trim() }, auth: false }));
      haptic.success();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ paddingTop: 4 }}><IconButton icon="back" label="Back" tone="none" onPress={() => router.back()} /></View>
        <View style={{ flex: 1, gap: 18, paddingTop: 16 }}>
          <T v="display">Forgot your password?</T>
          {done ? (
            <>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: c.trustWash, borderRadius: 18, padding: 16 }}>
                <Icon name="check" color={c.trust} />
                <T style={{ flex: 1 }}>{done.message}</T>
              </View>
              <T tone="muted">Open the email on this phone and tap the link to choose a new password. Then come back and sign in. Can't find it? Check spam, or try again in a few minutes.</T>
              {done.devResetUrl && <Banner tone="warn" onPress={() => WebBrowser.openBrowserAsync(done.devResetUrl!)}>Test mode: email isn't set up. Tap here to open the reset link.</Banner>}
            </>
          ) : (
            <>
              <T tone="muted">Enter the email you signed up with and we'll send you a link to choose a new password.</T>
              <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="send" onSubmitEditing={submit} />
              {err ? <Banner tone="alert">{err}</Banner> : null}
            </>
          )}
        </View>
        <View style={{ gap: 10, paddingBottom: 8 }}>
          {done ? <Button title="Back to sign in" size="lg" full onPress={() => router.replace("/sign-in")} />
            : <Button title="Send reset link" size="lg" full loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onPress={submit} />}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
