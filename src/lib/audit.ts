import "server-only";
import { db, schema } from "@/db";
import { clientIp } from "./http";

export async function audit(actorId: string | null, action: string, entity: string, entityId?: string | null, meta: object = {}) {
  let ip: string | null = null;
  try {
    ip = await clientIp();
  } catch {
    /* outside request scope (seed scripts) */
  }
  await db.insert(schema.auditLogs).values({ actorId, action, entity, entityId: entityId ?? null, meta: JSON.stringify(meta), ip });
}
