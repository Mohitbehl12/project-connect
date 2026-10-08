import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { api, tokens } from "./api";
import type { Me } from "./types";

type Status = "loading" | "signedOut" | "signedIn";
type Ctx = {
  status: Status;
  me: Me | undefined;
  meError: string | null;
  refetchMe: () => Promise<unknown>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; dob: string }) => Promise<{ devOtp?: string }>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);
const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    tokens.onSignedOut(() => { qc.clear(); setStatus("signedOut"); });
    tokens.hasSession().then((has) => setStatus(has ? "signedIn" : "signedOut"));
  }, [qc]);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/api/me"),
    enabled: status === "signedIn",
    staleTime: 30_000,
  });

  const signIn = useCallback(async (email: string, password: string) => {
    const t = await api("/api/auth/token", { body: { email, password, platform }, auth: false });
    await tokens.save(t);
    qc.clear();
    setStatus("signedIn");
  }, [qc]);

  const signUp = useCallback(async (input: { email: string; password: string; dob: string }) => {
    const r = await api("/api/auth/register", {
      body: { ...input, acceptLegal: true, confirmAdult: true, safetyAcknowledged: true, client: "app", platform },
      auth: false,
    });
    await tokens.save(r);
    qc.clear();
    setStatus("signedIn");
    return { devOtp: r.devOtp as string | undefined };
  }, [qc]);

  const signOut = useCallback(async () => {
    const rt = await tokens.refreshToken();
    try { await api("/api/auth/logout", { body: { refreshToken: rt }, auth: false }); } catch { /* offline sign-out still clears the device */ }
    await tokens.clear();
    qc.clear();
    setStatus("signedOut");
  }, [qc]);

  return (
    <AuthCtx.Provider value={{ status, me: meQuery.data, meError: meQuery.error ? (meQuery.error as Error).message : null, refetchMe: meQuery.refetch, signIn, signUp, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
