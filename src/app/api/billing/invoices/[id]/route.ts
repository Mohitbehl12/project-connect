import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { ApiError, ok, publicRoute } from "@/lib/http";
import { invoicePdf } from "@/lib/invoice";
import { appUrl, signScoped, verifyScoped } from "@/lib/paytoken";
import { can } from "@/lib/rbac";

/**
 * GET → the PDF. Auth: the owner's session, finance staff, or a 10-minute invoice token
 * (?t=…, from GET ?link=1) so the app can open it in the system browser or share sheet.
 */
export const GET = publicRoute<{ id: string }>(async ({ req, params }) => {
  const url = new URL(req.url);
  const me = await currentUser();
  const p = await db.query.payments.findFirst({ where: eq(schema.payments.id, params.id) });
  if (url.searchParams.get("link") === "1") {
    if (!me || !p || p.userId !== me.id || !p.invoiceNo) throw new ApiError(404, "Invoice not found.", "not_found");
    const t = await signScoped("invoice", me.id, p.id, 10);
    return ok({ url: `${appUrl()}/api/billing/invoices/${p.id}?t=${encodeURIComponent(t)}` });
  }
  const viaToken = await verifyScoped(url.searchParams.get("t"), "invoice", params.id);
  const allowed = p && p.invoiceNo && ((me && (me.id === p.userId || can(me.role, "payments.view"))) || viaToken === p.userId);
  if (!allowed) throw new ApiError(404, "Invoice not found.", "not_found");
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, p!.userId) });
  const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, p!.userId) });
  const pdf = await invoicePdf(p!, { name: profile?.firstName ?? "", email: user?.email ?? "" });
  return new Response(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="invoice-${p!.invoiceNo!.replace(/\//g, "-")}.pdf"`, "cache-control": "private, no-store" },
  });
});
