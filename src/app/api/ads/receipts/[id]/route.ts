import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdvertiser } from "@/lib/ads";
import { receiptPdf } from "@/lib/adsManage";
import { ApiError, route } from "@/lib/http";

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const adv = await requireAdvertiser(user);
  const t = await db.query.adTransactions.findFirst({ where: and(eq(schema.adTransactions.id, params.id), eq(schema.adTransactions.advertiserId, adv.id), eq(schema.adTransactions.status, "PAID")) });
  if (!t) throw new ApiError(404, "Receipt not found.", "not_found");
  return new Response(new Uint8Array(await receiptPdf(t, adv)), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${t.receiptNo}.pdf"`, "cache-control": "private, no-store" } });
}, { allowOnboarding: true });
