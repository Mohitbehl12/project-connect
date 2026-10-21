import { clientIp, ok, route } from "@/lib/http";
import { pendingLegal, recordAcceptances } from "@/lib/legal";
import { audit } from "@/lib/audit";
import { recordConsent } from "@/lib/consent";

/** Accepts every pending required document (shown to users after a new version is published). */
export const POST = route(async ({ user }) => {
  const pending = await pendingLegal(user.id);
  await recordAcceptances(user.id, pending.map((p) => p.versionId), await clientIp());
  const ip = await clientIp();
  for (const p of pending) {
    if (p.slug === "terms") await recordConsent(user.id, "TERMS", true, { version: `terms@v${p.version}`, ip });
    if (p.slug === "privacy") await recordConsent(user.id, "PRIVACY", true, { version: `privacy@v${p.version}`, ip });
    if (p.slug === "guidelines") await recordConsent(user.id, "SAFETY_RULES", true, { version: `guidelines@v${p.version}`, ip });
  }
  await audit(user.id, "legal.accept", "user", user.id, { versions: pending.map((p) => `${p.slug}@v${p.version}`) });
  return ok({ accepted: pending.length });
}, { allowSuspended: true });
