import { count, desc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

/** Recent matches (metadata only — staff cannot read conversations unless a report is filed). */
export const GET = route(async () => {
  const ms = await db.select().from(schema.matches).orderBy(desc(schema.matches.createdAt)).limit(100);
  const ids = [...new Set(ms.flatMap((m) => [m.userAId, m.userBId]))];
  const names = ids.length ? await db.select({ id: schema.profiles.userId, name: schema.profiles.firstName, city: schema.profiles.city }).from(schema.profiles).where(inArray(schema.profiles.userId, ids)) : [];
  const byId = new Map(names.map((n) => [n.id, n]));
  const msgCounts = ms.length
    ? await db.select({ matchId: schema.messages.matchId, n: count() }).from(schema.messages).where(inArray(schema.messages.matchId, ms.map((m) => m.id))).groupBy(schema.messages.matchId)
    : [];
  const mc = new Map(msgCounts.map((x) => [x.matchId, x.n]));
  return ok({
    matches: ms.map((m) => ({
      id: m.id, score: m.score, status: m.status, createdAt: m.createdAt, messages: mc.get(m.id) ?? 0,
      a: { id: m.userAId, ...byId.get(m.userAId) }, b: { id: m.userBId, ...byId.get(m.userBId) },
    })),
  });
}, { permission: "users.view" });

