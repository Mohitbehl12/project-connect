import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "./audit";

// Consent records. Each change is a new row (never edited), so we can show what someone agreed to,
// when, and under which wording. Terms and policies are also recorded in legal_acceptances per version.
// Device permissions (camera, microphone, location, notifications) are granted in the phone's own
// dialog; the app records the person's in-app choice next to it so they can see and change it here.

export const CONSENT_KINDS = {
  TERMS: { label: "Terms of Service", required: true, withdrawable: false },
  PRIVACY: { label: "Privacy Policy acknowledged", required: true, withdrawable: false },
  AGE_18: { label: "Confirmed 18 or older", required: true, withdrawable: false },
  SAFETY_RULES: { label: "Community and safety rules acknowledged", required: true, withdrawable: false },
  MARKETING: { label: "News and offers by email or notification", required: false, withdrawable: true },
  LOCATION: { label: "Show others my approximate distance (from my city — Kinara never uses GPS)", required: false, withdrawable: true },
  CAMERA: { label: "Camera for photos, selfie check and video calls", required: false, withdrawable: true },
  MICROPHONE: { label: "Microphone for voice messages and calls", required: false, withdrawable: true },
  VIDEO_CALLS: { label: "Take part in voice and video calls (only after you accept a request)", required: false, withdrawable: true },
  PUSH: { label: "Notifications on this device", required: false, withdrawable: true },
  PROFILE_VISIBLE: { label: "Show my profile in Discover", required: false, withdrawable: true },
} as const;
export type ConsentKind = keyof typeof CONSENT_KINDS;

export async function recordConsent(userId: string, kind: ConsentKind, granted: boolean, opts: { version?: string; source?: string; ip?: string | null } = {}) {
  const last = await currentConsent(userId, kind);
  if (last && last.granted === granted && last.version === (opts.version ?? null)) return last; // nothing changed
  const [row] = await db.insert(schema.consents).values({ userId, kind, granted, version: opts.version ?? null, source: opts.source ?? "app", ip: opts.ip ?? null }).returning();
  await audit(userId, granted ? "consent.granted" : "consent.withdrawn", "consent", row.id, { kind, version: opts.version ?? null });
  return row;
}

export async function currentConsent(userId: string, kind: ConsentKind) {
  return (await db.select().from(schema.consents).where(and(eq(schema.consents.userId, userId), eq(schema.consents.kind, kind)))
    .orderBy(desc(schema.consents.createdAt)).limit(1))[0] ?? null;
}

/**
 * Current state of every consent plus the full history (newest first). Accounts created before consent
 * records existed have no rows yet, so their current state falls back to what their settings actually are.
 */
export async function consentSummary(userId: string) {
  const rows = await db.select().from(schema.consents).where(eq(schema.consents.userId, userId)).orderBy(desc(schema.consents.createdAt));
  const [user, prefs, accepted] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, userId) }),
    db.query.preferences.findFirst({ where: eq(schema.preferences.userId, userId) }),
    db.select({ slug: schema.legalDocuments.slug, at: schema.legalAcceptances.acceptedAt, version: schema.legalVersions.version })
      .from(schema.legalAcceptances).innerJoin(schema.legalVersions, eq(schema.legalVersions.id, schema.legalAcceptances.versionId))
      .innerJoin(schema.legalDocuments, eq(schema.legalDocuments.id, schema.legalVersions.documentId)).where(eq(schema.legalAcceptances.userId, userId)),
  ]);
  const legal = (slug: string) => accepted.filter((a) => a.slug === slug).sort((a, b) => b.version - a.version)[0];
  const fallback = (k: ConsentKind): { granted: boolean; version: string | null; at: Date | null } | null => {
    const l = k === "TERMS" ? legal("terms") : k === "PRIVACY" ? legal("privacy") : k === "SAFETY_RULES" ? legal("guidelines") : undefined;
    if (l) return { granted: true, version: `${l.slug}@v${l.version}`, at: l.at };
    if (k === "AGE_18" && user?.dob) return { granted: true, version: null, at: user.createdAt };
    if (!prefs) return null;
    if (k === "MARKETING") return { granted: prefs.marketing, version: null, at: null };
    if (k === "LOCATION") return { granted: prefs.showDistance, version: null, at: null };
    if (k === "PROFILE_VISIBLE") return { granted: prefs.discoverable && !user?.deactivatedAt, version: null, at: null };
    if (k === "VIDEO_CALLS") return { granted: prefs.callRequests !== "NOBODY", version: null, at: null };
    return null;
  };
  const current = (Object.keys(CONSENT_KINDS) as ConsentKind[]).map((k) => {
    const r = rows.find((x) => x.kind === k);
    const f = r ? { granted: r.granted, version: r.version, at: r.createdAt } : fallback(k);
    return { kind: k, ...CONSENT_KINDS[k], granted: f?.granted ?? false, version: f?.version ?? null, at: f?.at ?? null, asked: !!f };
  });
  return { current, history: rows.map((r) => ({ kind: r.kind, label: CONSENT_KINDS[r.kind as ConsentKind]?.label ?? r.kind, granted: r.granted, version: r.version, source: r.source, at: r.createdAt })) };
}
