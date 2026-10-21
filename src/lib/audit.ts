import "server-only";
import { createHash } from "node:crypto";
import { asc, desc, gt, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { clientIp } from "./http";

// Tamper-evident audit trail. Every row carries sha256(previous hash + its own contents), so editing,
// inserting or deleting a row in the middle breaks the chain, and `verifyAuditChain` says where.
// This is tamper-EVIDENT, not tamper-proof: someone with database access could rewrite the whole chain.
// For stronger guarantees, copy the latest hash somewhere the database can't reach (see docs/COMPLIANCE.md).

const GENESIS = "0".repeat(64);

function rowHash(prev: string, r: { seq: number; actorId: string | null; action: string; entity: string; entityId: string | null; meta: string; ip: string | null; createdAt: Date }) {
  return createHash("sha256")
    .update([prev, r.seq, r.actorId ?? "", r.action, r.entity, r.entityId ?? "", r.meta, r.ip ?? "", r.createdAt.getTime()].join("␟"))
    .digest("hex");
}

// One writer at a time inside this process keeps the chain linear; across servers, SQLite's single writer
// plus the retry below does the same (a clash on `seq` is retried with the new tail).
let queue: Promise<unknown> = Promise.resolve();

export async function audit(actorId: string | null, action: string, entity: string, entityId?: string | null, meta: object = {}) {
  let ip: string | null = null;
  try {
    ip = await clientIp();
  } catch {
    /* outside request scope (seed scripts, jobs) */
  }
  const run = queue.then(() => append({ actorId, action, entity, entityId: entityId ?? null, meta: JSON.stringify(meta), ip }));
  queue = run.catch(() => {});
  await run;
}

async function append(r: { actorId: string | null; action: string; entity: string; entityId: string | null; meta: string; ip: string | null }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [tail] = await db.select({ seq: schema.auditLogs.seq, hash: schema.auditLogs.hash }).from(schema.auditLogs)
      .where(isNotNull(schema.auditLogs.seq)).orderBy(desc(schema.auditLogs.seq)).limit(1);
    const seq = (tail?.seq ?? 0) + 1;
    const prevHash = tail?.hash ?? GENESIS;
    const createdAt = new Date();
    const hash = rowHash(prevHash, { ...r, seq, createdAt });
    try {
      await db.insert(schema.auditLogs).values({ ...r, seq, prevHash, hash, createdAt });
      return;
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }
}

/** Walks the chain in order. Rows from before the chain existed (no seq) are skipped. */
export async function verifyAuditChain() {
  let checked = 0;
  let prev: string | null = null;
  let lastSeq = 0;
  for (;;) {
    const rows = await db.select().from(schema.auditLogs).where(gt(schema.auditLogs.seq, lastSeq)).orderBy(asc(schema.auditLogs.seq)).limit(1000);
    if (!rows.length) break;
    for (const r of rows) {
      const seq = r.seq!;
      // The oldest kept row may follow rows removed by the retention policy; its prevHash is then the anchor.
      if (prev !== null && (seq !== lastSeq + 1 || r.prevHash !== prev)) return { ok: false, checked, brokenAt: seq, reason: seq !== lastSeq + 1 ? "missing row" : "link mismatch" };
      if (rowHash(r.prevHash ?? GENESIS, { ...r, seq }) !== r.hash) return { ok: false, checked, brokenAt: seq, reason: "row changed" };
      prev = r.hash!;
      lastSeq = seq;
      checked++;
    }
  }
  return { ok: true, checked, head: prev, headSeq: lastSeq };
}
