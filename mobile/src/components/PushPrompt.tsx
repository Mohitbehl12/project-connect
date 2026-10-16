import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { enableWebPush, webPushState, type WebPushState } from "@/lib/webPush";
import { useTheme } from "@/theme/ThemeProvider";

const HIDE_KEY = "pc.pushPromptHidden";

/**
 * Web app only: a card offering notifications for messages, matches and calls.
 * `always` shows it even after "Not now" (used in Settings).
 */
export function PushPrompt({ always = false }: { always?: boolean }) {
  const { c } = useTheme();
  const [state, setState] = useState<WebPushState | null>(null);
  const [hidden, setHidden] = useState(!always);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    webPushState().then(setState).catch(() => setState("unsupported"));
    if (!always) AsyncStorage.getItem(HIDE_KEY).then((v) => setHidden(v === "1")).catch(() => setHidden(false));
  }, [always]);

  if (!state || state === "unsupported" || hidden) return null;
  if (state === "on") return always ? <Row c={c} icon="check" text="Notifications are on for this phone." /> : null;

  const body = state === "needs-install"
    ? "To get notified about messages, matches and calls on iPhone: tap Share, then Add to Home Screen, then open the app from your Home Screen."
    : state === "denied"
      ? "Notifications are blocked. Turn them on in your phone's Settings for this app, then come back."
      : "Know the moment someone messages, matches or calls you.";

  return (
    <View style={{ backgroundColor: c.brandWash, borderRadius: 18, padding: 14, gap: 10, marginHorizontal: always ? 0 : 20, marginBottom: always ? 0 : 10 }}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <Icon name="bell" color={c.brand} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="callout" strong>Turn on notifications</T>
          <T v="callout" tone="muted">{body}</T>
        </View>
        {!always && (
          <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={10} onPress={() => { setHidden(true); AsyncStorage.setItem(HIDE_KEY, "1").catch(() => {}); }}>
            <Icon name="close" size={18} color={c.muted} />
          </Pressable>
        )}
      </View>
      {state === "off" && (
        <Button title="Turn on" size="md" loading={busy} onPress={async () => {
          setBusy(true); setErr("");
          try { setState(await enableWebPush()); } catch (e: any) { setErr(e.message ?? "Couldn't turn notifications on. Try again."); }
          finally { setBusy(false); }
        }} />
      )}
      {err ? <T v="caption" tone="alert">{err}</T> : null}
    </View>
  );
}

function Row({ c, icon, text }: { c: any; icon: "check"; text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 8 }}>
      <Icon name={icon} color={c.trust} />
      <T v="callout">{text}</T>
    </View>
  );
}
