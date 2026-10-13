import { z } from "zod";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentSessionFamily, destroySession, revokeAllSessions } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, parseBody, route } from "@/lib/http";

/** Signed-in devices (one row per login, i.e. per refresh-token family). */
export const GET = route(async ({ user }) => {
  const current = await currentSessionFamily();
  const rows = await db.select().from(schema.sessions)
    .where(and(eq(schema.sessions.userId, user.id), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date())))
    .orderBy(desc(schema.sessions.lastUsedAt));
  const seen = new Set<string>();
  const devices = rows.filter((r) => (seen.has(r.family) ? false : (seen.add(r.family), true))).map((r) => ({
    id: r.family,
    name: r.deviceName ?? (r.platform === "ios" ? "iPhone" : r.platform === "android" ? "Android phone" : "Device"),
    platform: r.platform ?? "unknown",
    signedInAt: r.createdAt,
    lastActiveAt: r.lastUsedAt,
    current: r.family === current,
  }));
  return ok({ devices, note: "Approximate city isn't shown yet; it needs an IP-location service." });
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("revoke"), id: z.string().min(1) }),
  z.object({ action: z.literal("others") }),
  z.object({ action: z.literal("all") }),
]);

export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  const current = await currentSessionFamily();
  if (b.action === "revoke") {
    await db.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.userId, user.id), eq(schema.sessions.family, b.id)));
  } else if (b.action === "others") {
    await db.update(schema.sessions).set({ revokedAt: new Date() })
      .where(and(eq(schema.sessions.userId, user.id), isNull(schema.sessions.revokedAt), current ? ne(schema.sessions.family, current) : undefined));
  } else {
    // Everywhere, including this device and any web session: bumping tokenVersion kills access tokens and cookies too.
    await revokeAllSessions(user.id);
    await db.update(schema.users).set({ tokenVersion: user.tokenVersion + 1 }).where(eq(schema.users.id, user.id));
    await destroySession().catch(() => {});
  }
  await audit(user.id, `security.sessions_${b.action}`, "user", user.id);
  return ok({ done: true, signedOut: b.action === "all" });
});
