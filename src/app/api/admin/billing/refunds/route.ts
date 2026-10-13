import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requestRefund } from "@/lib/billing";
import { ok, parseBody, route } from "@/lib/http";

export const GET = route(async () => {
  const rows = await db.select({ r: schema.refunds, p: schema.payments, email: schema.users.email }).from(schema.refunds)
    .innerJoin(schema.payments, eq(schema.payments.id, schema.refunds.paymentId))
    .innerJoin(schema.users, eq(schema.users.id, schema.payments.userId))
    .orderBy(desc(schema.refunds.createdAt)).limit(100);
  const staff = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users);
  const who = (id: string | null) => (id ? staff.find((s) => s.id === id)?.email ?? id : null);
  return ok({
    refunds: rows.map(({ r, p, email }) => ({
      id: r.id, paymentId: p.id, email, invoiceNo: p.invoiceNo, amountMinor: r.amountMinor, currency: p.currency, paidMinor: p.amountMinor,
      reason: r.reason, revokeAccess: r.revokeAccess, status: r.status, requestedBy: who(r.requestedById), requestedById: r.requestedById,
      decidedBy: who(r.decidedById), decisionNote: r.decisionNote, createdAt: r.createdAt, decidedAt: r.decidedAt, processedAt: r.processedAt,
    })),
  });
}, { permission: "payments.view" });

const Body = z.object({ paymentId: z.string().min(1), amountMinor: z.number().int().positive(), reason: z.string().trim().min(5).max(500), revokeAccess: z.boolean().default(false) });

/** Opens a refund request. A different person with refund-approval rights must approve it. */
export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  return ok({ refund: await requestRefund(user, b) }, 201);
}, { permission: "payments.refund_request" });
