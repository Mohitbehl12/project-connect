import { z } from "zod";
import { asc, desc, eq, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { audit } from "@/lib/audit";

export const GET = route(async () => {
  const docs = await db.select().from(schema.legalDocuments).orderBy(asc(schema.legalDocuments.title));
  const versions = await db.select({
    id: schema.legalVersions.id, documentId: schema.legalVersions.documentId, version: schema.legalVersions.version,
    status: schema.legalVersions.status, effectiveAt: schema.legalVersions.effectiveAt, publishedAt: schema.legalVersions.publishedAt,
    createdAt: schema.legalVersions.createdAt, body: schema.legalVersions.body, changeSummary: schema.legalVersions.changeSummary,
    material: schema.legalVersions.material, lawyerReviewedBy: schema.legalVersions.lawyerReviewedBy, lawyerReviewedAt: schema.legalVersions.lawyerReviewedAt,
  }).from(schema.legalVersions).orderBy(desc(schema.legalVersions.version));
  const acceptances = await db.select({ versionId: schema.legalAcceptances.versionId }).from(schema.legalAcceptances);
  const counts = new Map<string, number>();
  for (const a of acceptances) counts.set(a.versionId, (counts.get(a.versionId) ?? 0) + 1);
  return ok({
    documents: docs.map((d) => ({
      ...d,
      versions: versions.filter((v) => v.documentId === d.id).map((v) => ({ ...v, acceptances: counts.get(v.id) ?? 0 })),
    })),
  });
}, { permission: "legal.edit" });

/** Creates a new DRAFT version. Published versions are never edited — every change is a new version. */
const Body = z.object({
  documentId: z.string(), body: z.string().trim().min(20).max(100_000),
  changeSummary: z.string().trim().max(1000).optional(), // shown to members: what changed
  material: z.boolean().default(true), // material → everyone accepts again; minor (typos, contact details) → no re-acceptance
});

export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  const doc = await db.query.legalDocuments.findFirst({ where: eq(schema.legalDocuments.id, b.documentId) });
  if (!doc) throw new ApiError(404, "Document not found.", "not_found");
  const [{ v }] = await db.select({ v: max(schema.legalVersions.version) }).from(schema.legalVersions).where(eq(schema.legalVersions.documentId, doc.id));
  const [row] = await db.insert(schema.legalVersions).values({ documentId: doc.id, version: (v ?? 0) + 1, body: b.body, createdById: user.id, changeSummary: b.changeSummary ?? null, material: b.material }).returning();
  await audit(user.id, "legal.draft", "legal_version", row.id, { slug: doc.slug, version: row.version });
  return ok({ id: row.id, version: row.version }, 201);
}, { permission: "legal.edit" });
