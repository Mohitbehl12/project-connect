import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, publicRoute } from "@/lib/http";
import { fillLegal } from "@/lib/legalText";

export const GET = publicRoute<{ slug: string }>(async ({ params }) => {
  const doc = await db.query.legalDocuments.findFirst({ where: eq(schema.legalDocuments.slug, params.slug) });
  if (!doc) throw new ApiError(404, "Document not found.", "not_found");
  const v = await db.query.legalVersions.findFirst({
    where: and(eq(schema.legalVersions.documentId, doc.id), eq(schema.legalVersions.status, "PUBLISHED")),
    orderBy: desc(schema.legalVersions.version),
  });
  if (!v) throw new ApiError(404, "No published version yet.", "not_found");
  return ok({
    slug: doc.slug, title: doc.title, version: v.version, effectiveAt: v.effectiveAt, body: await fillLegal(v.body),
    changeSummary: v.changeSummary, lawyerReviewed: !!v.lawyerReviewedAt,
  });
});
