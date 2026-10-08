import { clientIp, ok, route } from "@/lib/http";
import { pendingLegal, recordAcceptances } from "@/lib/legal";
import { audit } from "@/lib/audit";

/** Accepts every pending required document (shown to users after a new version is published). */
export const POST = route(async ({ user }) => {
  const pending = await pendingLegal(user.id);
  await recordAcceptances(user.id, pending.map((p) => p.versionId), await clientIp());
  await audit(user.id, "legal.accept", "user", user.id, { versions: pending.map((p) => `${p.slug}@v${p.version}`) });
  return ok({ accepted: pending.length });
}, { allowSuspended: true });
