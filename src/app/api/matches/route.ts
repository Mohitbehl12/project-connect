import { openSafe } from "@/lib/crypto";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";
import { ageFromDob } from "@/lib/matching";
import { photosFor } from "@/lib/photos";

export const GET = route(async ({ user }) => {
  const ms = await db.select().from(schema.matches)
    .where(and(eq(schema.matches.status, "ACTIVE"), or(eq(schema.matches.userAId, user.id), eq(schema.matches.userBId, user.id))))
    .orderBy(desc(schema.matches.createdAt));
  if (!ms.length) return ok({ matches: [] });

  const otherIds = ms.map((m) => (m.userAId === user.id ? m.userBId : m.userAId));
  const people = await db.select({ u: schema.users, p: schema.profiles }).from(schema.users)
    .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
    .where(inArray(schema.users.id, otherIds));
  const byId = new Map(people.map((x) => [x.u.id, x]));

  const ids = ms.map((m) => m.id);
  const msgs = await db.select().from(schema.messages).where(inArray(schema.messages.matchId, ids)).orderBy(desc(schema.messages.createdAt));
  const unread = await db.select().from(schema.messages)
    .where(and(inArray(schema.messages.matchId, ids), ne(schema.messages.senderId, user.id), isNull(schema.messages.readAt)));

  const photoMap = await photosFor(otherIds);
  const list = ms.flatMap((m) => {
    const otherId = m.userAId === user.id ? m.userBId : m.userAId;
    const o = byId.get(otherId);
    if (!o || o.u.status === "BANNED") return [];
    const last = msgs.find((x) => x.matchId === m.id);
    return [{
      id: m.id,
      score: m.score,
      createdAt: m.createdAt,
      other: { id: otherId, firstName: o.p.firstName, age: ageFromDob(o.p.dob), city: o.p.city, verified: o.u.selfieStatus === "VERIFIED", photo: photoMap.get(otherId)?.[0] ?? null },
      lastMessage: last ? { body: last.deletedAt ? "Message deleted" : openSafe(last.body, last.matchId).slice(0, 80), mine: last.senderId === user.id, at: last.createdAt } : null,
      unread: unread.filter((x) => x.matchId === m.id).length,
    }];
  });
  // Conversations with recent activity first, then new matches.
  list.sort((a, b) => +(b.lastMessage?.at ?? b.createdAt) - +(a.lastMessage?.at ?? a.createdAt));
  return ok({ matches: list });
});
