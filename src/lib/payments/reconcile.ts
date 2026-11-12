import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { recordIncident } from "../ops";

// Daily reconciliation: compares what Razorpay says it captured with what this database recorded.
//
// Webhooks are the source of truth for activating a plan, and webhooks can be lost (an outage, a wrong
// secret, a deploy at the wrong moment). Without this check a member can be charged and never get what
// they paid for, and nobody would know until they complain. Any difference opens a PAYMENT incident for
// a person; nothing is changed automatically.
//
// The gateway call has not been run against a live Razorpay account yet (see docs/PAYMENTS.md).

export type GatewayPayment = { id: string; amount: number; currency: string; status: string; createdAt: number };
export type LocalPayment = { providerPaymentId: string | null; amountMinor: number; currency: string; status: string };

export type Differences = {
  /** Captured at the gateway, no row here at all: someone paid and we never heard. */
  missingLocally: string[];
  /** Captured at the gateway, but our row isn't marked as paid (or refunded). */
  notCapturedLocally: string[];
  /** Both captured, different amount or currency. */
  amountMismatch: string[];
  /** We say captured, the gateway (within the same window) says otherwise. */
  notCapturedAtGateway: string[];
};

const PAID_LOCALLY = new Set(["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"]);
const PAID_AT_GATEWAY = new Set(["captured", "refunded"]);

/** Pure comparison (unit tested). `gateway` and `local` must cover the same time window. */
export function diffPayments(gateway: GatewayPayment[], local: LocalPayment[]): Differences {
  const byId = new Map(local.filter((l) => l.providerPaymentId).map((l) => [l.providerPaymentId!, l]));
  const seen = new Map(gateway.map((g) => [g.id, g]));
  const out: Differences = { missingLocally: [], notCapturedLocally: [], amountMismatch: [], notCapturedAtGateway: [] };
  for (const g of gateway) {
    if (!PAID_AT_GATEWAY.has(g.status)) continue;
    const l = byId.get(g.id);
    if (!l) { out.missingLocally.push(g.id); continue; }
    if (!PAID_LOCALLY.has(l.status)) { out.notCapturedLocally.push(g.id); continue; }
    if (l.amountMinor !== g.amount || l.currency.toUpperCase() !== g.currency.toUpperCase()) out.amountMismatch.push(g.id);
  }
  for (const [id, l] of byId) {
    const g = seen.get(id);
    if (g && l.status === "CAPTURED" && !PAID_AT_GATEWAY.has(g.status)) out.notCapturedAtGateway.push(id);
  }
  return out;
}

export const hasDifferences = (d: Differences) => Object.values(d).some((v) => v.length > 0);

const API = "https://api.razorpay.com/v1";
const HOUR = 3_600_000;

async function gatewayPayments(fromMs: number, toMs: number): Promise<GatewayPayment[]> {
  const auth = "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const out: GatewayPayment[] = [];
  // At most 20 pages of 100: a day with more than 2,000 payments needs a settlement-report import instead.
  for (let skip = 0; skip < 2000; skip += 100) {
    const url = `${API}/payments?from=${Math.floor(fromMs / 1000)}&to=${Math.floor(toMs / 1000)}&count=100&skip=${skip}`;
    const res = await fetch(url, { headers: { authorization: auth }, signal: AbortSignal.timeout(20_000) });
    const j = (await res.json().catch(() => ({}))) as { items?: { id: string; amount: number; currency: string; status: string; created_at: number }[]; error?: { code?: string } };
    if (!res.ok) throw new Error(`Razorpay /payments failed: ${j.error?.code ?? res.status}`);
    const items = j.items ?? [];
    for (const p of items) out.push({ id: p.id, amount: p.amount, currency: p.currency, status: p.status, createdAt: p.created_at * 1000 });
    if (items.length < 100) break;
  }
  return out;
}

/**
 * Compares the last three days (ending one hour ago, so webhooks still in flight aren't reported).
 * Does nothing unless Razorpay is the live gateway.
 */
export async function reconcileRazorpay(now = new Date()) {
  if (process.env.BILLING_PROVIDER !== "razorpay" || !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)
    return { ran: false as const, reason: "Razorpay is not the live gateway." };
  const to = now.getTime() - HOUR, from = to - 72 * HOUR;
  const gateway = await gatewayPayments(from, to);
  // Local rows from a day earlier than the window, so a payment created just before it isn't called missing.
  const local = await db.select({ providerPaymentId: schema.payments.providerPaymentId, amountMinor: schema.payments.amountMinor, currency: schema.payments.currency, status: schema.payments.status })
    .from(schema.payments).where(and(eq(schema.payments.provider, "RAZORPAY"), gte(schema.payments.createdAt, new Date(from - 24 * HOUR))));
  const diff = diffPayments(gateway, local);
  if (hasDifferences(diff)) {
    const counts = Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.length]));
    await recordIncident({
      kind: "PAYMENT", service: "billing reconciliation", severity: "HIGH",
      title: `Payments don't match Razorpay: ${diff.missingLocally.length} missing here, ${diff.notCapturedLocally.length} not marked paid, ${diff.amountMismatch.length} amount differences, ${diff.notCapturedAtGateway.length} not captured at the gateway`,
      fingerprintKey: `reconcile:${now.toISOString().slice(0, 10)}`,
      // Gateway payment ids only: they identify a payment to staff with gateway access and nothing else.
      context: { metric: "reconciliation", value: JSON.stringify({ counts, sample: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.slice(0, 10)])) }) },
    });
  }
  return { ran: true as const, checked: gateway.length, differences: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.length])) };
}
