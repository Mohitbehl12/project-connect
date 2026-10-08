import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, parseBody, route } from "@/lib/http";

const Body = z.object({
  pushToken: z.string().min(10).max(200).regex(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/, "Expected an Expo push token"),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().max(20).optional(),
});

/** Registers this phone for push notifications (re-registering moves the token to the current user). */
export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  await db.insert(schema.devices).values({ userId: user.id, ...b })
    .onConflictDoUpdate({ target: schema.devices.pushToken, set: { userId: user.id, platform: b.platform, appVersion: b.appVersion, updatedAt: new Date() } });
  return ok({ registered: true }, 201);
}, { allowSuspended: true });

/** Unregister on sign-out. */
export const DELETE = route(async ({ req, user }) => {
  const token = new URL(req.url).searchParams.get("pushToken") ?? "";
  await db.delete(schema.devices).where(and(eq(schema.devices.userId, user.id), eq(schema.devices.pushToken, token)));
  return ok({ removed: true });
}, { allowSuspended: true });
