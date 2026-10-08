import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInRight, ZoomIn } from "react-native-reanimated";
import { CITIES, COUNTRIES, GENDERS, INTEREST_EMOJI, INTERESTS, PERSONALITY_QUESTIONS } from "@shared/constants";
import { ArcMark } from "@/components/Arc";
import { Button, IconButton } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { PhotoGrid } from "@/components/PhotoGrid";
import { PoleSlider } from "@/components/PoleSlider";
import { T } from "@/components/Text";
import { Banner, Chip, Field, ProgressBar, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

// Steps: 0 name+gender · 1 city · 2 looking for · 3 interests · 4..13 personality · 14 preferences · 15 photos · 16 verify · 17 ready
const Q0 = 4;
const PREFS = Q0 + PERSONALITY_QUESTIONS.length;
const PHOTOS = PREFS + 1;
const VERIFY = PHOTOS + 1;
const READY = VERIFY + 1;

const GOALS = [
  { key: "relationship", emoji: "❤️", title: "A relationship", body: "Something serious that could last", intents: ["MARRIAGE", "LONG_TERM"] },
  { key: "dating", emoji: "💛", title: "Dating", body: "Meeting people and seeing where it goes", intents: ["LONG_TERM_OPEN", "FIGURING_OUT", "CASUAL"] },
  { key: "connections", emoji: "💚", title: "New connections", body: "Friends first", intents: ["FRIENDS"] },
] as const;
const INTENT_LABEL: Record<string, string> = {
  MARRIAGE: "Marriage-minded", LONG_TERM: "Long-term relationship", LONG_TERM_OPEN: "Long-term, open to short",
  FIGURING_OUT: "Still figuring it out", CASUAL: "Something casual", FRIENDS: "New friends",
};
const DISTANCES = [10, 25, 50, 100, 300];

function BigChoice({ emoji, title, body, selected, onPress }: { emoji: string; title: string; body: string; selected: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { haptic.tick(); onPress(); }}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: 22, backgroundColor: selected ? c.brand : c.surface, borderWidth: 1.5, borderColor: selected ? c.brand : c.line }}>
      <T style={{ fontSize: 28, lineHeight: 34 }}>{emoji}</T>
      <View style={{ flex: 1 }}>
        <T v="headline" style={{ color: selected ? c.brandText : c.text }}>{title}</T>
        <T v="callout" style={{ color: selected ? c.brandText : c.muted, opacity: selected ? 0.85 : 1 }}>{body}</T>
      </View>
      {selected && <Icon name="check" color={c.brandText} />}
    </Pressable>
  );
}

function Stepper({ label, value, onChange, min, max }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 20, padding: 14, gap: 8, alignItems: "center" }} accessibilityRole="adjustable" accessibilityLabel={`${label}, ${value}`}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(e) => onChange(Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === "increment" ? 1 : -1))))}>
      <T v="caption" tone="muted">{label}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <IconButton icon="minus" label={`Decrease ${label}`} size={40} onPress={() => onChange(Math.max(min, value - 1))} />
        <T v="title" style={{ minWidth: 40, textAlign: "center" }}>{value}</T>
        <IconButton icon="plus" label={`Increase ${label}`} size={40} onPress={() => onChange(Math.min(max, value + 1))} />
      </View>
    </View>
  );
}

export default function Onboarding() {
  const { me, refetchMe } = useAuth();
  const { c } = useTheme();
  const [step, setStep] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Answers held locally, saved at the natural checkpoints.
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [goal, setGoal] = useState<string>("");
  const [intent, setIntent] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showMe, setShowMe] = useState<string[]>([]);
  const [ageMin, setAgeMin] = useState(22);
  const [ageMax, setAgeMax] = useState(35);
  const [distance, setDistance] = useState(50);
  const [photoCount, setPhotoCount] = useState(0);
  const [verifyRequested, setVerifyRequested] = useState(false);

  // Resume where the person left off.
  useEffect(() => {
    if (!me || step !== null) return;
    const p = me.profile;
    if (p) {
      setName(p.firstName); setGender(p.gender); setCity(p.city); setIntent(p.intent);
      setInterests(p.interests ? p.interests.split(",").filter(Boolean) : []);
    }
    setAnswers(me.answers ?? {});
    if (me.user.dob) {
      const age = new Date().getFullYear() - Number(me.user.dob.slice(0, 4));
      setAgeMin(Math.max(18, age - 5)); setAgeMax(Math.min(80, age + 6));
    }
    const answered = Object.keys(me.answers ?? {}).length;
    setStep(!p ? 0 : (p.interests?.split(",").filter(Boolean).length ?? 0) < 3 ? 3 : answered < 6 ? Q0 + answered : !me.preferences?.interestedIn ? PREFS : PHOTOS);
  }, [me, step]);

  const cities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    return Object.entries(CITIES).filter(([n]) => !q || n.toLowerCase().includes(q));
  }, [cityQuery]);

  if (step === null) return <Screen><View /></Screen>;

  const total = READY;
  const go = (n: number) => { setErr(""); haptic.light(); setStep(n); };

  async function save(fn: () => Promise<unknown>, next: number) {
    setBusy(true); setErr("");
    try { await fn(); go(next); } catch (e: any) { setErr(e.message); haptic.warning(); } finally { setBusy(false); }
  }

  const q = step >= Q0 && step < PREFS ? PERSONALITY_QUESTIONS[step - Q0] : null;

  let body: React.ReactNode = null;
  let cta: React.ReactNode = null;

  if (step === 0) {
    body = (
      <>
        <T v="display">Let's make your profile shine ✨</T>
        <Field label="First name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="given-name" maxLength={40} hint="The only name people see." />
        <View style={{ gap: 8 }}>
          <T v="callout" tone="muted">I am a</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(GENDERS).map(([k, l]) => <Chip key={k} label={l} selected={gender === k} onPress={() => setGender(k)} />)}
          </View>
        </View>
      </>
    );
    cta = <Button title="Continue" size="lg" full disabled={!name.trim() || !gender} onPress={() => go(1)} />;
  } else if (step === 1) {
    body = (
      <>
        <T v="display">Where are you based?</T>
        <T tone="muted">People see your city and a rounded distance — never your exact location.</T>
        <TextInput placeholder="Search cities" placeholderTextColor={c.faint} value={cityQuery} onChangeText={setCityQuery} accessibilityLabel="Search cities"
          style={{ height: 50, borderRadius: 16, backgroundColor: c.surface, paddingHorizontal: 16, fontSize: 17, color: c.text, fontFamily: "Figtree_500Medium" }} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
          {cities.map(([n, info]) => (
            <Pressable key={n} accessibilityRole="radio" accessibilityState={{ selected: city === n }} onPress={() => { haptic.tick(); setCity(n); }}
              style={{ flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 18, backgroundColor: city === n ? c.brand : c.surface }}>
              <T v="headline" style={{ flex: 1, color: city === n ? c.brandText : c.text }}>{n}</T>
              <T v="caption" style={{ color: city === n ? c.brandText : c.muted }}>{COUNTRIES[info.country]?.name}</T>
            </Pressable>
          ))}
        </ScrollView>
      </>
    );
    cta = <Button title="Continue" size="lg" full disabled={!city} onPress={() => go(2)} />;
  } else if (step === 2) {
    const g = GOALS.find((x) => x.key === goal);
    body = (
      <>
        <T v="display">What are you looking for?</T>
        <View style={{ gap: 10 }}>
          {GOALS.map((x) => <BigChoice key={x.key} emoji={x.emoji} title={x.title} body={x.body} selected={goal === x.key}
            onPress={() => { setGoal(x.key); setIntent(x.intents.length === 1 ? x.intents[0] : ""); }} />)}
        </View>
        {g && g.intents.length > 1 && (
          <Animated.View entering={FadeIn} style={{ gap: 8 }}>
            <T v="callout" tone="muted">More specifically</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {g.intents.map((i) => <Chip key={i} label={INTENT_LABEL[i]} selected={intent === i} onPress={() => setIntent(i)} />)}
            </View>
          </Animated.View>
        )}
      </>
    );
    cta = <Button title="Continue" size="lg" full loading={busy} disabled={!intent}
      onPress={() => save(() => api("/api/profile", { method: "PATCH", body: { firstName: name.trim(), gender, city, intent } }), 3)} />;
  } else if (step === 3) {
    body = (
      <>
        <T v="display">What are you into?</T>
        <T tone="muted">Pick at least three. Shared interests become conversation starters.</T>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 12 }}>
          {Object.entries(INTERESTS).map(([k, l]) => (
            <Chip key={k} label={l} emoji={INTEREST_EMOJI[k]} selected={interests.includes(k)}
              onPress={() => setInterests(interests.includes(k) ? interests.filter((x) => x !== k) : interests.length >= 10 ? interests : [...interests, k])} />
          ))}
        </ScrollView>
      </>
    );
    cta = <Button title={interests.length < 3 ? `Pick ${3 - interests.length} more` : "Continue"} size="lg" full loading={busy} disabled={interests.length < 3}
      onPress={() => save(() => api("/api/profile", { method: "PATCH", body: { interests } }), Q0)} />;
  } else if (q) {
    const i = step - Q0;
    const last = i === PERSONALITY_QUESTIONS.length - 1;
    body = (
      <>
        <T v="caption" tone="faint">About you · {i + 1} of {PERSONALITY_QUESTIONS.length}</T>
        <T v="display">{q.prompt}</T>
        <T tone="muted">No right answers. Only what you share with a match is ever shown.</T>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <PoleSlider left={q.left} right={q.right} value={answers[q.key]}
            onChange={(v) => { setAnswers({ ...answers, [q.key]: v }); if (!last) setTimeout(() => go(step + 1), 320); }} />
        </View>
      </>
    );
    cta = last
      ? <Button title="Continue" size="lg" full loading={busy} disabled={Object.keys(answers).length < 6} onPress={() => save(() => api("/api/personality", { method: "PUT", body: { answers } }), PREFS)} />
      : <Button title={answers[q.key] ? "Next" : "Skip this one"} v={answers[q.key] ? "primary" : "ghost"} size="lg" full onPress={() => go(step + 1)} />;
  } else if (step === PREFS) {
    body = (
      <>
        <T v="display">Who would you like to meet?</T>
        <View style={{ gap: 8 }}>
          <T v="callout" tone="muted">Show me</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(GENDERS).map(([k, l]) => <Chip key={k} label={l} selected={showMe.includes(k)} onPress={() => setShowMe(showMe.includes(k) ? showMe.filter((x) => x !== k) : [...showMe, k])} />)}
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Stepper label="Youngest" value={ageMin} min={18} max={ageMax} onChange={setAgeMin} />
          <Stepper label="Oldest" value={ageMax} min={ageMin} max={99} onChange={setAgeMax} />
        </View>
        <View style={{ gap: 8 }}>
          <T v="callout" tone="muted">Within</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {DISTANCES.map((d) => <Chip key={d} label={d >= 300 ? "300+ km" : `${d} km`} selected={distance === d} onPress={() => setDistance(d)} />)}
          </View>
        </View>
      </>
    );
    cta = <Button title="Continue" size="lg" full loading={busy} disabled={!showMe.length}
      onPress={() => save(() => api("/api/preferences", { method: "PUT", body: { interestedIn: showMe, ageMin, ageMax, maxDistanceKm: distance, longDistance: distance >= 300 } }), PHOTOS)} />;
  } else if (step === PHOTOS) {
    body = (
      <>
        <T v="display">Add your best photos</T>
        <T tone="muted">At least one, up to six. Clear, well-lit photos of you work best.</T>
        <ScrollView style={{ flex: 1 }}><PhotoGrid onCountChange={setPhotoCount} /></ScrollView>
      </>
    );
    cta = (
      <View style={{ gap: 6 }}>
        <Button title="Continue" size="lg" full onPress={() => go(VERIFY)} disabled={photoCount < 1 && !me?.profile?.completeness} />
        {photoCount < 1 && <Button title="I'll add photos later" v="ghost" full onPress={() => go(VERIFY)} />}
      </View>
    );
  } else if (step === VERIFY) {
    body = (
      <>
        <T v="display">Get your verified ring</T>
        <T tone="muted">A quick selfie check shows people you're really you. Verified profiles get noticeably more likes.</T>
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <Animated.View entering={ZoomIn.springify()} style={{ width: 132, height: 132, borderRadius: 66, backgroundColor: c.trustWash, alignItems: "center", justifyContent: "center" }}>
            <Icon name="shield" size={64} color={c.trust} />
          </Animated.View>
        </View>
        {verifyRequested && <Banner tone="trust">Thanks! We'll review it shortly and add your ring.</Banner>}
        <T v="caption" tone="faint">Your selfie is only used for the check and is never shown on your profile. In this test build a moderator reviews requests by hand.</T>
      </>
    );
    cta = verifyRequested
      ? <Button title="Continue" size="lg" full onPress={() => go(READY)} />
      : (
        <View style={{ gap: 6 }}>
          <Button title="Verify me" size="lg" full loading={busy} onPress={() => save(async () => { await api("/api/verification", { method: "POST" }).catch((e) => { if (e.code !== "pending" && e.code !== "already_verified") throw e; }); setVerifyRequested(true); }, VERIFY)} />
          <Button title="Maybe later" v="ghost" full onPress={() => go(READY)} />
        </View>
      );
  } else {
    const leans = PERSONALITY_QUESTIONS.filter((x) => answers[x.key] && answers[x.key] !== 3).slice(0, 3)
      .map((x) => (answers[x.key] < 3 ? x.left : x.right).toLowerCase());
    body = (
      <View style={{ flex: 1, justifyContent: "center", gap: 22 }}>
        <Animated.View entering={ZoomIn.duration(500)} style={{ alignItems: "center" }}><ArcMark size={120} /></Animated.View>
        <T v="display" center>You're ready to meet your matches.</T>
        <View style={{ backgroundColor: c.surface, borderRadius: 24, padding: 18, gap: 12 }}>
          <T v="headline">Your compatibility profile</T>
          {leans.length > 0 && <T tone="muted">You lean towards {leans.join(", ").replace(/, ([^,]*)$/, " and $1")}.</T>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {interests.slice(0, 6).map((k) => <Chip key={k} small label={INTERESTS[k]} emoji={INTEREST_EMOJI[k]} tone="shared" />)}
          </View>
          <T v="caption" tone="faint">{INTENT_LABEL[intent] ?? ""}{intent ? " · " : ""}{city}</T>
        </View>
      </View>
    );
    cta = <Button title="Start discovering" v="accent" size="lg" full onPress={async () => { await refetchMe(); router.replace("/discover"); }} />;
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {step < READY && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 }}>
            <IconButton icon="back" label="Back" tone="none" disabled={step === 0} onPress={() => go(Math.max(0, step - 1))} />
            <View style={{ flex: 1, paddingRight: 12 }}><ProgressBar value={(step / total) * 100} /></View>
          </View>
        )}
        <Animated.View key={step} entering={FadeInRight.duration(240)} style={{ flex: 1, gap: 16, paddingTop: 16 }}>
          {body}
          {err ? <Banner tone="alert">{err}</Banner> : null}
        </Animated.View>
        <View style={{ paddingTop: 10, paddingBottom: 8 }}>{cta}</View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
