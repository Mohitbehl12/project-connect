import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

/** Recent sign-in attempts on this account, newest first. IPs are shortened to the network part. */
export const GET = route(async ({ user }) => {
  const rows = await db.select().from(schema.loginEvents).where(eq(schema.loginEvents.userId, user.id)).orderBy(desc(schema.loginEvents.createdAt)).limit(30);
  const mask = (ip: string | null) => (!ip ? null : ip.includes(":") ? ip.split(":").slice(0, 3).join(":") + ":…" : ip.split(".").slice(0, 2).join(".") + ".x.x");
  return ok({
    logins: rows.map((r) => ({
      at: r.createdAt, success: r.success, platform: r.platform, device: r.deviceName, network: mask(r.ip),
      reason: r.success ? null : ({ bad_password: "Wrong password", locked: "Account temporarily locked", banned: "Blocked", totp_required: "Waiting for 2-step code", bad_totp: "Wrong 2-step code" } as Record<string, string>)[r.reason ?? ""] ?? "Failed",
    })),
  });
});
