import "server-only";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addRiskSignal } from "./risk";

/** Sign-up checks: many accounts from one app install, or a burst of sign-ups from one network. */
export async function signupRiskChecks(userId: string, ip: string, installId: string | null) {
  if (installId) {
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(schema.users).where(and(eq(schema.users.signupInstallId, installId), ne(schema.users.id, userId)));
    const others = Number(r?.n ?? 0);
    if (others >= 2) await addRiskSignal(userId, "SHARED_DEVICE", others >= 4 ? 40 : 20, `${others + 1} accounts created on this app install`);
  }
  if (ip && ip !== "unknown") {
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(schema.users).where(and(eq(schema.users.signupIp, ip), gte(schema.users.createdAt, new Date(Date.now() - 3600_000))));
    const n = Number(r?.n ?? 0);
    // Campus and office networks are shared, so this is a light signal unless the burst is large.
    if (n >= 6) await addRiskSignal(userId, "SIGNUP_BURST", n >= 15 ? 30 : 10, `${n} sign-ups from this network in an hour`);
  }
}

/** Repeated safety-screening flags on someone's messages. */
export async function messageFlagCheck(userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(schema.messages)
    .where(and(eq(schema.messages.senderId, userId), ne(schema.messages.flags, ""), gte(schema.messages.createdAt, new Date(Date.now() - 7 * 86_400_000))));
  const n = Number(r?.n ?? 0);
  if (n >= 3) await addRiskSignal(userId, "MESSAGE_FLAGS", n >= 8 ? 35 : 15, `${n} flagged messages in 7 days`);
}
