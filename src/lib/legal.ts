import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Latest published version of every document required at signup. */
export async function requiredLegalVersions() {
  const docs = await db.query.legalDocuments.findMany({ where: eq(schema.legalDocuments.requiredAtSignup, true) });
  const out: { slug: string; title: string; versionId: string; version: number }[] = [];
  for (const d of docs) {
    const v = await db.query.legalVersions.findFirst({
      where: and(eq(schema.legalVersions.documentId, d.id), eq(schema.legalVersions.status, "PUBLISHED")),
      orderBy: desc(schema.legalVersions.version),
    });
    if (v) out.push({ slug: d.slug, title: d.title, versionId: v.id, version: v.version });
  }
  return out;
}

/** Required documents the user has not accepted in their current published version. */
export async function pendingLegal(userId: string) {
  const required = await requiredLegalVersions();
  const accepted = await db.select().from(schema.legalAcceptances).where(eq(schema.legalAcceptances.userId, userId));
  const acceptedIds = new Set(accepted.map((a) => a.versionId));
  return required.filter((r) => !acceptedIds.has(r.versionId));
}

export async function recordAcceptances(userId: string, versionIds: string[], ip: string | null) {
  for (const versionId of versionIds)
    await db.insert(schema.legalAcceptances).values({ userId, versionId, ip }).onConflictDoNothing();
}
