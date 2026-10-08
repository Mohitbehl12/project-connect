import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/Button";
import { T } from "@/components/Text";
import { Banner, Field, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/");
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ paddingTop: 4 }}><IconButton icon="back" label="Back" tone="none" onPress={() => router.back()} /></View>
        <View style={{ flex: 1, gap: 20, paddingTop: 16 }}>
          <T v="display">Welcome back</T>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
          {err ? <Banner tone="alert">{err}</Banner> : null}
        </View>
        <View style={{ gap: 10, paddingBottom: 8 }}>
          <Button title="Sign in" size="lg" full loading={busy} disabled={!email || !password} onPress={submit} />
          <T v="caption" tone="faint" center>Test accounts: aanya@demo.local or rohan@demo.local · Demo!2026</T>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
