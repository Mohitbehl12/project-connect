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

/**
 * Required documents the user still needs to accept. A minor change (material = false: typos, contact
 * details) doesn't ask anyone to accept again; a material change does. Accepting a later version counts.
 */
export async function pendingLegal(userId: string) {
  const required = await requiredLegalVersions();
  if (!required.length) return [];
  const accepted = await db.select({ documentId: schema.legalVersions.documentId, version: schema.legalVersions.version })
    .from(schema.legalAcceptances).innerJoin(schema.legalVersions, eq(schema.legalVersions.id, schema.legalAcceptances.versionId))
    .where(eq(schema.legalAcceptances.userId, userId));
  const out: typeof required = [];
  for (const r of required) {
    const doc = await db.query.legalDocuments.findFirst({ where: eq(schema.legalDocuments.slug, r.slug) });
    const versions = await db.select({ version: schema.legalVersions.version, material: schema.legalVersions.material, status: schema.legalVersions.status })
      .from(schema.legalVersions).where(eq(schema.legalVersions.documentId, doc!.id));
    // The newest published-or-superseded version that was a material change, up to the current one.
    const lastMaterial = Math.max(1, ...versions.filter((v) => v.material && v.version <= r.version && (v.status === "PUBLISHED" || v.status === "SUPERSEDED")).map((v) => v.version));
    const best = Math.max(0, ...accepted.filter((a) => a.documentId === doc!.id).map((a) => a.version));
    if (best < lastMaterial) out.push(r);
  }
  return out;
}

export async function recordAcceptances(userId: string, versionIds: string[], ip: string | null) {
  for (const versionId of versionIds)
    await db.insert(schema.legalAcceptances).values({ userId, versionId, ip }).onConflictDoNothing();
}
