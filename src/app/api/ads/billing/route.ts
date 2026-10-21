import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdvertiser } from "@/lib/ads";
import { ok, route } from "@/lib/http";

export const GET = route(async ({ user }) => {
  const adv = await requireAdvertiser(user);
  const tx = await db.select().from(schema.adTransactions).where(eq(schema.adTransactions.advertiserId, adv.id)).orderBy(desc(schema.adTransactions.createdAt)).limit(200);
  return ok({ balanceMinor: adv.balanceMinor, transactions: tx.map((t) => ({ id: t.id, kind: t.kind, status: t.status, amountMinor: t.amountMinor, provider: t.provider, receiptNo: t.receiptNo, note: t.kind === "REFUND" ? t.note : null, createdAt: t.createdAt, paidAt: t.paidAt })) });
}, { allowOnboarding: true });
