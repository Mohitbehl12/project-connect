import { Redirect } from "expo-router";
import { View } from "react-native";
import { ArcLoader } from "@/components/Arc";
import { ErrorState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/theme/ThemeProvider";

/** Routes to the right place once the session is known. */
export default function Index() {
  const { status, me, meError, refetchMe } = useAuth();
  const { c } = useTheme();
  if (status === "signedOut") return <Redirect href="/welcome" />;
  if (status === "signedIn" && me) {
    if (me.user.role !== "USER") return <ErrorState message="Staff accounts use the web admin panel." />;
    return <Redirect href={me.user.onboardingStep < 3 ? "/onboarding" : "/discover"} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
      {meError ? <ErrorState message={meError} onRetry={() => refetchMe()} /> : <ArcLoader size={44} />}
    </View>
  );
}
