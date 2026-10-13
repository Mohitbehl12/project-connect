import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { RISK_KINDS } from "@/lib/risk";

/** Risk queue (Medium/High accounts with open signals), failed-login hot spots and webhook failures. */
export const GET = route(async () => {
  const users = await db.select({ id: schema.users.id, email: schema.users.email, risk: schema.users.riskLevel, status: schema.users.status, selfie: schema.users.selfieStatus, createdAt: schema.users.createdAt })
    .from(schema.users).where(inArray(schema.users.riskLevel, ["MEDIUM", "HIGH"])).limit(200);
  const signals = users.length ? await db.select().from(schema.riskSignals).where(and(inArray(schema.riskSignals.userId, users.map((u) => u.id)), isNull(schema.riskSignals.resolvedAt))).orderBy(desc(schema.riskSignals.createdAt)) : [];
  const since = new Date(Date.now() - 86_400_000);
  const failedByIp = await db.select({ network: schema.loginEvents.ip, n: sql<number>`count(*)`, accounts: sql<number>`count(distinct ${schema.loginEvents.userId})` })
    .from(schema.loginEvents).where(and(eq(schema.loginEvents.success, false), gte(schema.loginEvents.createdAt, since))).groupBy(schema.loginEvents.ip).orderBy(desc(sql`2`)).limit(10);
  const webhookFailures = await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.status, "FAILED")).orderBy(desc(schema.webhookEvents.receivedAt)).limit(20);
  return ok({
    kinds: RISK_KINDS,
    queue: users.map((u) => ({ ...u, signals: signals.filter((s) => s.userId === u.id) })).sort((a, b) => (a.risk === "HIGH" ? -1 : 1) - (b.risk === "HIGH" ? -1 : 1)),
    failedLogins24h: failedByIp,
    webhookFailures,
  });
}, { permission: "security.view" });
