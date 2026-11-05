import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { Banner, Chip, Field } from "@/components/ui";
import { api } from "@/lib/api";

type Nominee = { name: string; relationship: string; contact: string } | null;
export const useNominee = () => useQuery({ queryKey: ["nominee"], queryFn: () => api<{ nominee: Nominee; relationships: string[] }>("/api/privacy/nominee") });

/** Name someone who can act on your data if you can't (India's DPDP Act, s.14). */
export function NomineeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const q = useNominee();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", relationship: "", contact: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (q.data?.nominee) setF(q.data.nominee); }, [q.data?.nominee]);

  async function run(fn: () => Promise<unknown>) {
    setErr(""); setBusy(true);
    try { await fn(); await qc.invalidateQueries({ queryKey: ["nominee"] }); onClose(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <BottomSheet open={open} onClose={onClose} title="Nominee">
      <T tone="muted">Someone who can ask us to see, correct or delete your data if you die or can't act yourself. We never contact them; they get in touch with our Grievance Officer, and we ask for proof first.</T>
      <Field label="Their full name" value={f.name} onChangeText={(name) => setF({ ...f, name })} maxLength={80} />
      <T v="callout" tone="muted">Relationship</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(q.data?.relationships ?? []).map((r) => <Chip key={r} label={r} selected={f.relationship === r} onPress={() => setF({ ...f, relationship: r })} />)}
      </View>
      <Field label="Their email or phone" value={f.contact} onChangeText={(contact) => setF({ ...f, contact })} maxLength={120} autoCapitalize="none" />
      {err ? <Banner tone="alert">{err}</Banner> : null}
      <Button title="Save nominee" full loading={busy} disabled={!f.name || !f.relationship || !f.contact} onPress={() => run(() => api("/api/privacy/nominee", { method: "PUT", body: f }))} />
      {q.data?.nominee ? <Button title="Remove nominee" v="ghost" full onPress={() => run(async () => { await api("/api/privacy/nominee", { method: "DELETE" }); setF({ name: "", relationship: "", contact: "" }); })} /> : null}
    </BottomSheet>
  );
}
