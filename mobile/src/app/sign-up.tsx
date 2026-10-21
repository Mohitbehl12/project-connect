import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";
import { Button, IconButton } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Banner, Field, ProgressBar, Screen } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const STEPS = 3;

function ageOf(y: number, m: number, d: number) {
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
}

function Check({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => { haptic.tick(); onToggle(); }}
      style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 10 }}>
      <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brand : "transparent", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        {on && <Icon name="check" size={18} color={c.brandText} stroke={2.4} />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export default function SignUp() {
  const { signUp } = useAuth();
  const { c } = useTheme();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const invite = useLocalSearchParams<{ ref?: string }>().ref;
  const [referral, setReferral] = useState(typeof invite === "string" ? invite.toUpperCase() : "");
  const [dd, setDd] = useState(""); const [mm, setMm] = useState(""); const [yyyy, setYyyy] = useState("");
  const [agree, setAgree] = useState({ adult: false, legal: false, safety: false });
  const [marketing, setMarketing] = useState(false); // optional, never pre-ticked
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pwOk = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const dob = useMemo(() => {
    const d = Number(dd), m = Number(mm), y = Number(yyyy);
    if (!d || !m || yyyy.length !== 4) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCDate() !== d || date.getUTCMonth() !== m - 1) return { invalid: true as const };
    return { iso: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`, age: ageOf(y, m, d) };
  }, [dd, mm, yyyy]);

  async function finish() {
    if (!dob || "invalid" in dob) return;
    setErr(""); setBusy(true);
    try {
      await signUp({ email: email.trim(), password, dob: dob.iso, referralCode: referral, marketing });
      router.replace("/onboarding");
    } catch (e: any) {
      setErr(e.message); setBusy(false);
      if (e.code === "email_taken") setStep(0);
    }
  }

  const next = () => { setErr(""); haptic.light(); setStep((s) => s + 1); };
  const back = () => (step === 0 ? router.back() : setStep((s) => s - 1));
  const legal = (slug: string) => Linking.openURL(`${API_URL}/legal/${slug}`);

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 }}>
          <IconButton icon="back" label="Back" tone="none" onPress={back} />
          <View style={{ flex: 1, paddingRight: 12 }}><ProgressBar value={((step + 1) / STEPS) * 100} /></View>
        </View>

        <Animated.View key={step} entering={FadeInRight.duration(260)} style={{ flex: 1, gap: 18, paddingTop: 20 }}>
          {step === 0 && (
            <>
              <T v="display">Let's get you started</T>
              <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword"
                hint="At least 8 characters with a letter and a number." error={password && !pwOk ? "Add a letter and a number, 8 characters or more." : undefined} />
              <Field label="Invite code (optional)" value={referral} onChangeText={(t) => setReferral(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))} autoCapitalize="characters" hint="From a friend? Add their code — they'll get Premium days once you're verified." />
            </>
          )}
          {step === 1 && (
            <>
              <T v="display">When's your birthday?</T>
              <T tone="muted">We show your age, never your birthday. You must be 18 or older.</T>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="Day" placeholder="DD" value={dd} onChangeText={(t) => setDd(t.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" maxLength={2} /></View>
                <View style={{ flex: 1 }}><Field label="Month" placeholder="MM" value={mm} onChangeText={(t) => setMm(t.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" maxLength={2} /></View>
                <View style={{ flex: 1.4 }}><Field label="Year" placeholder="YYYY" value={yyyy} onChangeText={(t) => setYyyy(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" maxLength={4} /></View>
              </View>
              {dob && "invalid" in dob && <Banner tone="alert">That date doesn't exist. Check the day and month.</Banner>}
              {dob && !("invalid" in dob) && dob.age < 18 && <Banner tone="alert">Kinara is only for people aged 18 and over.</Banner>}
              {dob && !("invalid" in dob) && dob.age >= 18 && <T v="headline" tone="trust">You're {dob.age}. </T>}
            </>
          )}
          {step === 2 && (
            <>
              <T v="display">A few promises</T>
              <T tone="muted">They keep this a good place to meet people.</T>
              <View style={{ backgroundColor: c.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 }}>
                <Check on={agree.adult} onToggle={() => setAgree({ ...agree, adult: !agree.adult })}><T>I'm 18 or older.</T></Check>
                <Check on={agree.legal} onToggle={() => setAgree({ ...agree, legal: !agree.legal })}>
                  <T>I agree to the <T tone="brand" strong onPress={() => legal("terms")}>Terms</T>, <T tone="brand" strong onPress={() => legal("privacy")}>Privacy Policy</T> and <T tone="brand" strong onPress={() => legal("guidelines")}>Community Guidelines</T>.</T>
                </Check>
                <Check on={agree.safety} onToggle={() => setAgree({ ...agree, safety: !agree.safety })}>
                  <T>I'll be respectful, and I'll meet new people in public places.</T>
                </Check>
              </View>
              <View style={{ backgroundColor: c.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 }}>
                <Check on={marketing} onToggle={() => setMarketing(!marketing)}>
                  <T>Optional: send me news and offers. <T tone="muted">You can change this any time in Privacy Center.</T></T>
                </Check>
              </View>
              <View style={{ backgroundColor: c.trustWash, borderRadius: 16, padding: 12, gap: 4 }}>
                <T v="callout" strong>Pricing in India</T>
                <T v="caption" tone="muted">Women: everything free, for life. Men: 15 days of Premium free, then ₹100/month if you choose to continue — no card needed for the trial and nothing is charged automatically. Prices elsewhere are shown in the app.</T>
              </View>
            </>
          )}
          {err ? <Banner tone="alert">{err}</Banner> : null}
        </Animated.View>

        <View style={{ paddingBottom: 8 }}>
          {step === 0 && <Button title="Continue" size="lg" full disabled={!emailOk || !pwOk} onPress={next} />}
          {step === 1 && <Button title="Continue" size="lg" full disabled={!dob || "invalid" in dob || dob.age < 18} onPress={next} />}
          {step === 2 && <Button title="Create account" size="lg" full loading={busy} disabled={!agree.adult || !agree.legal || !agree.safety} onPress={finish} />}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
