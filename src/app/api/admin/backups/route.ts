import { backupStatus, runBackup } from "@/lib/backup";
import { ok, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

export const GET = route(async () => ok(await backupStatus()), { permission: "config.edit" });

/** "Back up now". */
export const POST = route(async ({ user }) => {
  await rateLimit(`backup-now:${user.id}`, 6, 60 * 60_000);
  const r = await runBackup();
  await audit(user.id, "ops.backup_now", "backup", r.ran ? r.key : "none", r);
  return ok(r);
}, { permission: "config.edit" });
