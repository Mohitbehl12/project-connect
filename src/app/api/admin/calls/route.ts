import { desc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

/** Recent call requests and calls (who, when, outcome — never content). */
export const GET = route(async () => {
  const [reqs, calls] = await Promise.all([
    db.select().from(schema.callRequests).orderBy(desc(schema.callRequests.createdAt)).limit(200),
    db.select().from(schema.calls).orderBy(desc(schema.calls.createdAt)).limit(200),
  ]);
  const ids = [...new Set([...reqs.flatMap((r) => [r.fromId, r.toId]), ...calls.flatMap((c) => [c.callerId, c.calleeId])])];
  const names = ids.length ? await db.select({ id: schema.profiles.userId, name: schema.profiles.firstName }).from(schema.profiles).where(inArray(schema.profiles.userId, ids)) : [];
  const n = (id: string) => names.find((x) => x.id === id)?.name ?? "Member";
  return ok({
    requests: reqs.map((r) => ({ id: r.id, from: { id: r.fromId, name: n(r.fromId) }, to: { id: r.toId, name: n(r.toId) }, kind: r.kind, state: r.state, createdAt: r.createdAt, respondedAt: r.respondedAt })),
    calls: calls.map((c) => ({ id: c.id, caller: { id: c.callerId, name: n(c.callerId) }, callee: { id: c.calleeId, name: n(c.calleeId) }, kind: c.kind, state: c.state, endReason: c.endReason, createdAt: c.createdAt,
      durationSec: c.answeredAt && c.endedAt ? Math.round((c.endedAt.getTime() - c.answeredAt.getTime()) / 1000) : null })),
  });
}, { permission: "users.view" });
