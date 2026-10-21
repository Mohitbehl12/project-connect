import "server-only";
import { z } from "zod";
import { and, desc, eq, inArray, lte, max, sql } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { AD_CATEGORIES, Creative, GENERAL_REJECTION, OBJECTIVES, PLACEMENTS, PRICING, Targeting, autoCheck, campaignStats, logAdAudit, parseCreative, parseTargeting } from "./ads";
import { getConfig } from "./config";
import { ApiError } from "./http";
import { notify } from "./notify";
import { hmacHex, safeEqualHex } from "./payments/razorpay";

const keys = <T extends object>(o: T) => Object.keys(o) as [string, ...string[]];
const ymd = () => new Date().toISOString().slice(0, 10);

export const CampaignInput = z.object({
  name: z.string().trim().min(3).max(80),
  objective: z.enum(keys(OBJECTIVES)),
  placements: z.array(z.enum(keys(PLACEMENTS))).min(1),
  pricing: z.enum(keys(PRICING)).default("CPM"),
  dailyBudgetMinor: z.number().int().min(0).max(100_000_000).default(0),
  totalBudgetMinor: z.number().int().min(0).max(1_000_000_000).default(0),
  startAt: z.string().datetime({ offset: true }).nullable().optional(),
  endAt: z.string().datetime({ offset: true }).nullable().optional(),
  targeting: Targeting.default(() => Targeting.parse({})),
  creative: Creative,
});
export type CampaignInput = z.infer<typeof CampaignInput>;

/** What the advertiser sees of a campaign (their own data only). */
export function campaignView(c: typeof schema.adCampaigns.$inferSelect) {
  return {
    id: c.id, name: c.name, objective: c.objective, status: c.status, placements: c.placements.split(","), pricing: c.pricing,
    dailyBudgetMinor: c.dailyBudgetMinor, totalBudgetMinor: c.totalBudgetMinor, spentMinor: c.spentMinor,
    remainingMinor: c.totalBudgetMinor ? Math.max(0, c.totalBudgetMinor - c.spentMinor) : null,
    startAt: c.startAt, endAt: c.endAt, targeting: parseTargeting(c.targeting), creative: parseCreative(c.creative),
    rejection: c.status === "REJECTED" ? c.publicReason ?? GENERAL_REJECTION : null, submittedAt: c.submittedAt, createdAt: c.createdAt,
    conversionKey: c.conversionKey,
  };
}

function values(b: CampaignInput) {
  return {
    name: b.name, objective: b.objective, placements: b.placements.join(","), pricing: b.pricing,
    dailyBudgetMinor: b.dailyBudgetMinor, totalBudgetMinor: b.totalBudgetMinor,
    startAt: b.startAt ? new Date(b.startAt) : null, endAt: b.endAt ? new Date(b.endAt) : null,
    targeting: JSON.stringify(b.targeting), creative: JSON.stringify(b.creative), updatedAt: new Date(),
  };
}

export async function ownCampaign(advertiserId: string, id: string) {
  const c = await db.query.adCampaigns.findFirst({ where: and(eq(schema.adCampaigns.id, id), eq(schema.adCampaigns.advertiserId, advertiserId)) });
  if (!c) throw new ApiError(404, "Campaign not found.", "not_found");
  return c;
}

export async function createCampaign(advertiserId: string, b: CampaignInput) {
  const [c] = await db.insert(schema.adCampaigns).values({ advertiserId, ...values(b) }).returning();
  await logAdAudit(null, "create", c.id, { advertiserId });
  return c;
}

/** Editing. A live or approved campaign whose content changes goes back for review — nothing unreviewed is shown. */
export async function updateCampaign(advertiserId: string, id: string, b: CampaignInput) {
  const c = await ownCampaign(advertiserId, id);
  if (c.status === "COMPLETED") throw new ApiError(409, "This campaign has finished. Duplicate it to run it again.", "completed");
  const v = values(b);
  const contentChanged = v.creative !== c.creative || v.targeting !== c.targeting || v.placements !== c.placements || v.pricing !== c.pricing;
  const status = ["ACTIVE", "APPROVED", "PAUSED", "PENDING_REVIEW"].includes(c.status) && contentChanged ? "DRAFT" : c.status === "REJECTED" ? "DRAFT" : c.status;
  const [u] = await db.update(schema.adCampaigns).set({ ...v, status }).where(eq(schema.adCampaigns.id, id)).returning();
  return { campaign: u, backToDraft: status === "DRAFT" && c.status !== "DRAFT" };
}

export async function submitCampaign(adv: typeof schema.advertisers.$inferSelect, id: string) {
  const c = await ownCampaign(adv.id, id);
  if (!["DRAFT", "REJECTED"].includes(c.status)) throw new ApiError(409, "Only drafts can be submitted.", "bad_state");
  if (adv.status !== "ACTIVE") throw new ApiError(403, "Your advertiser account is suspended.", "suspended");
  const cr = parseCreative(c.creative);
  if (!cr.imageKeys.length && !cr.videoKey) throw new ApiError(422, "Add at least one image or a video.", "no_creative");
  if (c.objective !== "AWARENESS" && !cr.url) throw new ApiError(422, "Add the website address people go to when they tap your ad.", "no_url");
  const minDaily = await getConfig("ads.minDailyBudgetMinor");
  if (c.pricing !== "FIXED" && c.dailyBudgetMinor < minDaily) throw new ApiError(422, `The daily budget must be at least ₹${minDaily / 100}.`, "budget");
  if (c.totalBudgetMinor && c.totalBudgetMinor < c.dailyBudgetMinor) throw new ApiError(422, "The total budget can't be below the daily budget.", "budget");
  if (c.pricing === "FIXED" && (!c.startAt || !c.endAt)) throw new ApiError(422, "Fixed placements need start and end dates.", "dates");
  if (c.endAt && c.startAt && c.endAt <= c.startAt) throw new ApiError(422, "The end date must be after the start date.", "dates");
  const check = autoCheck({ name: c.name, creative: cr, category: adv.category });
  if (check.hard.length) {
    await db.update(schema.adCampaigns).set({ status: "REJECTED", autoFlags: check.hard.join("; "), publicReason: GENERAL_REJECTION, submittedAt: new Date(), reviewedAt: new Date() }).where(eq(schema.adCampaigns.id, id));
    await logAdAudit(null, "auto_reject", id, { reasons: check.hard });
    return { status: "REJECTED", message: GENERAL_REJECTION };
  }
  await db.update(schema.adCampaigns).set({ status: "PENDING_REVIEW", autoFlags: check.soft.join("; ") || null, publicReason: null, submittedAt: new Date() }).where(eq(schema.adCampaigns.id, id));
  await logAdAudit(null, "submit", id, { flags: check.soft });
  return { status: "PENDING_REVIEW", message: "Submitted. Our team reviews every ad — usually within one working day." };
}

export async function setPaused(advertiserId: string, id: string, paused: boolean) {
  const c = await ownCampaign(advertiserId, id);
  if (paused && !["ACTIVE", "APPROVED"].includes(c.status)) throw new ApiError(409, "Only running or scheduled campaigns can be paused.", "bad_state");
  if (!paused && c.status !== "PAUSED") throw new ApiError(409, "Only paused campaigns can be resumed.", "bad_state");
  const status = paused ? "PAUSED" : c.startAt && c.startAt > new Date() ? "APPROVED" : "ACTIVE";
  await db.update(schema.adCampaigns).set({ status }).where(eq(schema.adCampaigns.id, id));
  await logAdAudit(null, paused ? "pause" : "resume", id);
  return { status };
}

// ---- staff review -------------------------------------------------------------------------------------------
export async function reviewCampaign(staff: User, id: string, b: { action: "approve" | "reject" | "pause" | "resume" | "delete"; note?: string; publicReason?: string; verifyAdvertiser?: boolean }) {
  const c = await db.query.adCampaigns.findFirst({ where: eq(schema.adCampaigns.id, id) });
  if (!c) throw new ApiError(404, "Campaign not found.", "not_found");
  const adv = (await db.query.advertisers.findFirst({ where: eq(schema.advertisers.id, c.advertiserId) }))!;
  if (b.action === "delete") {
    await db.delete(schema.adCampaigns).where(eq(schema.adCampaigns.id, id));
    await logAdAudit(staff.id, "delete", id, { note: b.note });
    return { status: "DELETED" };
  }
  if (b.action === "approve") {
    if (c.status !== "PENDING_REVIEW") throw new ApiError(409, "Only ads waiting for review can be approved.", "bad_state");
    if (b.verifyAdvertiser && adv.verification === "UNVERIFIED") await setVerification(staff, adv.id, "VERIFIED");
    const fresh = (await db.query.advertisers.findFirst({ where: eq(schema.advertisers.id, adv.id) }))!;
    if (fresh.verification === "UNVERIFIED") throw new ApiError(409, "Verify the business first — ads only go live from verified advertisers.", "unverified");
    if (c.pricing === "FIXED") {
      const daysN = Math.max(1, Math.ceil(((c.endAt?.getTime() ?? 0) - (c.startAt?.getTime() ?? 0)) / 86400_000));
      const cost = daysN * (await getConfig("ads.pricing")).fixedPerDayMinor;
      const r = await db.update(schema.advertisers).set({ balanceMinor: sql`${schema.advertisers.balanceMinor} - ${cost}` })
        .where(and(eq(schema.advertisers.id, adv.id), sql`${schema.advertisers.balanceMinor} >= ${cost}`)).returning({ id: schema.advertisers.id });
      if (!r.length) throw new ApiError(402, `Not enough balance for this fixed placement (₹${(cost / 100).toLocaleString("en-IN")} for ${daysN} days). Ask the advertiser to top up.`, "balance");
      await db.update(schema.adCampaigns).set({ spentMinor: cost }).where(eq(schema.adCampaigns.id, id));
      await db.insert(schema.adTransactions).values({ advertiserId: adv.id, kind: "FIXED_PLACEMENT", status: "DONE", amountMinor: -cost, note: `${c.name}: ${daysN} days` });
    } else if (fresh.balanceMinor <= 0) {
      throw new ApiError(402, "The advertiser has no balance yet. Approve once they've topped up.", "balance");
    }
    const status = c.startAt && c.startAt > new Date() ? "APPROVED" : "ACTIVE";
    await db.update(schema.adCampaigns).set({ status, reviewedById: staff.id, reviewedAt: new Date(), reviewNote: b.note ?? null, publicReason: null }).where(eq(schema.adCampaigns.id, id));
    await notify(adv.userId, "SUBSCRIPTION", "Your ad was approved ✅", `"${c.name}" ${status === "ACTIVE" ? "is now live" : "will start on schedule"}.`, "/ads");
    await logAdAudit(staff.id, "approve", id, { note: b.note });
    return { status };
  }
  if (b.action === "reject") {
    await db.update(schema.adCampaigns).set({ status: "REJECTED", reviewedById: staff.id, reviewedAt: new Date(), reviewNote: b.note ?? null, publicReason: b.publicReason?.trim() || GENERAL_REJECTION }).where(eq(schema.adCampaigns.id, id));
    await notify(adv.userId, "SUBSCRIPTION", "Your ad needs changes", `"${c.name}": ${b.publicReason?.trim() || GENERAL_REJECTION} You can edit and resubmit it.`, "/ads");
    await logAdAudit(staff.id, "reject", id, { note: b.note });
    return { status: "REJECTED" };
  }
  const status = b.action === "pause" ? "PAUSED" : "ACTIVE";
  await db.update(schema.adCampaigns).set({ status, reviewNote: b.note ?? c.reviewNote }).where(eq(schema.adCampaigns.id, id));
  await logAdAudit(staff.id, b.action, id, { note: b.note });
  return { status };
}

export async function setVerification(staff: User, advertiserId: string, level: "UNVERIFIED" | "VERIFIED" | "TRUSTED") {
  await db.update(schema.advertisers).set({ verification: level, verifiedById: staff.id, verifiedAt: new Date() }).where(eq(schema.advertisers.id, advertiserId));
  await logAdAudit(staff.id, "verification", advertiserId, { level });
}

export async function setAdvertiserStatus(staff: User, advertiserId: string, status: "ACTIVE" | "SUSPENDED", why: string) {
  await db.update(schema.advertisers).set({ status }).where(eq(schema.advertisers.id, advertiserId));
  if (status === "SUSPENDED") await db.update(schema.adCampaigns).set({ status: "PAUSED" }).where(and(eq(schema.adCampaigns.advertiserId, advertiserId), inArray(schema.adCampaigns.status, ["ACTIVE", "APPROVED"])));
  await logAdAudit(staff.id, status === "SUSPENDED" ? "suspend_advertiser" : "restore_advertiser", advertiserId, { why });
}

/** Scheduled: start approved campaigns when their start date arrives, finish them at the end date. */
export async function runAdJobs(now = new Date()) {
  const started = await db.update(schema.adCampaigns).set({ status: "ACTIVE" }).where(and(eq(schema.adCampaigns.status, "APPROVED"), lte(schema.adCampaigns.startAt, now))).returning({ id: schema.adCampaigns.id });
  const ended = await db.update(schema.adCampaigns).set({ status: "COMPLETED" }).where(and(inArray(schema.adCampaigns.status, ["ACTIVE", "APPROVED", "PAUSED"]), lte(schema.adCampaigns.endAt, now))).returning({ id: schema.adCampaigns.id });
  return { started: started.length, ended: ended.length };
}

// ---- money ---------------------------------------------------------------------------------------------------
const rzpOn = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const testPaymentsAllowed = () => process.env.NODE_ENV !== "production" || process.env.ENABLE_MOCK_PAYMENTS === "true";

export async function startTopup(adv: typeof schema.advertisers.$inferSelect, amountMinor: number) {
  const min = await getConfig("ads.minTopupMinor");
  if (amountMinor < min) throw new ApiError(422, `The minimum top-up is ₹${min / 100}.`, "min_topup");
  if (amountMinor > 50_000_00) throw new ApiError(422, "For top-ups above ₹50,000, contact us for an invoice.", "max_topup");
  const [t] = await db.insert(schema.adTransactions).values({ advertiserId: adv.id, kind: "TOPUP", amountMinor, provider: rzpOn() ? "RAZORPAY" : "TEST" }).returning();
  if (rzpOn()) {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({ amount: amountMinor, currency: "INR", receipt: `ad_${t.id.slice(0, 30)}`, notes: { kind: "ad_topup", tx: t.id } }) });
    if (!res.ok) throw new ApiError(502, "The payment service didn't respond. Try again in a minute.", "gateway_error");
    const order = (await res.json()) as { id: string };
    await db.update(schema.adTransactions).set({ providerOrderId: order.id }).where(eq(schema.adTransactions.id, t.id));
    return { id: t.id, provider: "RAZORPAY", orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID, amountMinor, name: adv.businessName, email: adv.email };
  }
  if (!testPaymentsAllowed()) throw new ApiError(503, "Payments aren't set up yet.", "payments_off");
  return { id: t.id, provider: "TEST", amountMinor };
}

async function credit(txId: string, providerPaymentId: string | null) {
  const t = await db.query.adTransactions.findFirst({ where: eq(schema.adTransactions.id, txId) });
  if (!t || t.kind !== "TOPUP") return null;
  if (t.status === "PAID") return t; // idempotent (browser callback and webhook can both arrive)
  const [{ n }] = await db.select({ n: max(schema.adTransactions.receiptNo) }).from(schema.adTransactions);
  const next = `KN-AD-${new Date().getUTCFullYear()}-${String((Number(String(n ?? "").split("-").pop()) || 0) + 1).padStart(5, "0")}`;
  const r = await db.update(schema.adTransactions).set({ status: "PAID", paidAt: new Date(), providerPaymentId, receiptNo: next })
    .where(and(eq(schema.adTransactions.id, txId), eq(schema.adTransactions.status, "PENDING"))).returning();
  if (!r.length) return t;
  await db.update(schema.advertisers).set({ balanceMinor: sql`${schema.advertisers.balanceMinor} + ${t.amountMinor}` }).where(eq(schema.advertisers.id, t.advertiserId));
  await logAdAudit(null, "topup", t.advertiserId, { amountMinor: t.amountMinor, receipt: next });
  return r[0];
}

export async function confirmTopup(adv: typeof schema.advertisers.$inferSelect, txId: string, b: { paymentId?: string; signature?: string; test?: boolean }) {
  const t = await db.query.adTransactions.findFirst({ where: and(eq(schema.adTransactions.id, txId), eq(schema.adTransactions.advertiserId, adv.id)) });
  if (!t) throw new ApiError(404, "Top-up not found.", "not_found");
  if (t.provider === "TEST") {
    if (!testPaymentsAllowed()) throw new ApiError(403, "Test payments are off.", "forbidden");
    return credit(t.id, `test_${t.id.slice(0, 8)}`);
  }
  // Razorpay Checkout returns order_id|payment_id signed with the key secret.
  if (!b.paymentId || !b.signature || !t.providerOrderId) throw new ApiError(422, "Missing payment details.", "validation");
  if (!safeEqualHex(hmacHex(process.env.RAZORPAY_KEY_SECRET!, `${t.providerOrderId}|${b.paymentId}`), b.signature)) throw new ApiError(400, "The payment couldn't be verified.", "bad_signature");
  return credit(t.id, b.paymentId);
}

/** Called from the Razorpay webhook for captured payments on ad top-up orders. */
export async function captureAdTopup(orderId: string | null | undefined, paymentId: string) {
  if (!orderId) return null;
  const t = await db.query.adTransactions.findFirst({ where: and(eq(schema.adTransactions.providerOrderId, orderId), eq(schema.adTransactions.kind, "TOPUP")) });
  if (!t) return null;
  await credit(t.id, paymentId);
  return t.id;
}

export async function requestRefund(adv: typeof schema.advertisers.$inferSelect, amountMinor: number, reason: string) {
  if (amountMinor <= 0 || amountMinor > adv.balanceMinor) throw new ApiError(422, "You can ask for up to your unused balance.", "amount");
  const open = await db.query.adTransactions.findFirst({ where: and(eq(schema.adTransactions.advertiserId, adv.id), eq(schema.adTransactions.kind, "REFUND"), eq(schema.adTransactions.status, "REQUESTED")) });
  if (open) throw new ApiError(409, "You already have a refund request in progress.", "open_request");
  const [t] = await db.insert(schema.adTransactions).values({ advertiserId: adv.id, kind: "REFUND", status: "REQUESTED", amountMinor: -amountMinor, note: reason }).returning();
  await logAdAudit(null, "refund_request", adv.id, { amountMinor });
  return t;
}

export async function decideRefund(staff: User, txId: string, approve: boolean, note: string) {
  const t = await db.query.adTransactions.findFirst({ where: eq(schema.adTransactions.id, txId) });
  if (!t || t.kind !== "REFUND" || t.status !== "REQUESTED") throw new ApiError(404, "Refund request not found.", "not_found");
  if (!approve) {
    await db.update(schema.adTransactions).set({ status: "REJECTED", decidedById: staff.id, note: `${t.note ?? ""} — ${note}` }).where(eq(schema.adTransactions.id, txId));
    return { status: "REJECTED" };
  }
  const amount = -t.amountMinor;
  const r = await db.update(schema.advertisers).set({ balanceMinor: sql`${schema.advertisers.balanceMinor} - ${amount}` })
    .where(and(eq(schema.advertisers.id, t.advertiserId), sql`${schema.advertisers.balanceMinor} >= ${amount}`)).returning({ id: schema.advertisers.id });
  if (!r.length) throw new ApiError(409, "The balance is now lower than the refund (ads ran meanwhile). Reject and ask them to request again.", "balance");
  // Refund against the most recent paid Razorpay top-ups; test-mode top-ups are just marked.
  const paid = await db.select().from(schema.adTransactions).where(and(eq(schema.adTransactions.advertiserId, t.advertiserId), eq(schema.adTransactions.kind, "TOPUP"), eq(schema.adTransactions.status, "PAID"))).orderBy(desc(schema.adTransactions.paidAt));
  let left = amount;
  const refs: string[] = [];
  for (const p of paid) {
    if (left <= 0) break;
    const part = Math.min(left, p.amountMinor);
    if (p.provider === "RAZORPAY" && p.providerPaymentId) {
      const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
      const res = await fetch(`https://api.razorpay.com/v1/payments/${p.providerPaymentId}/refund`, { method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/json" }, body: JSON.stringify({ amount: part, notes: { tx: t.id } }) });
      if (res.ok) refs.push(((await res.json()) as { id: string }).id);
    } else refs.push(`test_refund_${p.id.slice(0, 6)}`);
    left -= part;
  }
  await db.update(schema.adTransactions).set({ status: "DONE", decidedById: staff.id, providerPaymentId: refs.join(","), paidAt: new Date(), note: `${t.note ?? ""} — ${note}` }).where(eq(schema.adTransactions.id, txId));
  await logAdAudit(staff.id, "refund", t.advertiserId, { amountMinor: amount });
  return { status: "DONE" };
}

export async function receiptPdf(t: typeof schema.adTransactions.$inferSelect, adv: typeof schema.advertisers.$inferSelect) {
  const seller = await getConfig("billing.seller");
  const doc = await PDFDocument.create();
  doc.setTitle(`Receipt ${t.receiptNo}`);
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.05, 0.1), muted = rgb(0.4, 0.33, 0.38);
  let y = 790;
  const text = (s: string, x: number, size = 10, f = font, color = ink) => page.drawText(s, { x, y, size, font: f, color });
  const rate = seller.gstRatePct ?? 18;
  const taxable = Math.round((t.amountMinor * 100) / (100 + rate));
  const money = (m: number) => `INR ${(m / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  text("Kinara Ads", 50, 20, bold); y -= 18; text(t.provider === "TEST" ? "RECEIPT — TEST MODE (no money was taken)" : "TAX INVOICE / RECEIPT", 50, 11, bold, muted); y -= 30;
  text(seller.name, 50, 10, bold); text(`Receipt no. ${t.receiptNo}`, 340, 10, bold); y -= 14;
  text(seller.address, 50, 9, font, muted); text(`Date ${(t.paidAt ?? t.createdAt).toLocaleDateString("en-GB")}`, 340, 9, font, muted); y -= 14;
  if (seller.gstin) { text(`GSTIN ${seller.gstin}`, 50, 9, font, muted); y -= 14; }
  y -= 16; text("Billed to", 50, 9, bold, muted); y -= 14;
  text(adv.businessName, 50, 10, bold); y -= 13; text(adv.email, 50, 9, font, muted); y -= 13;
  if (adv.gstin) { text(`GSTIN ${adv.gstin}`, 50, 9, font, muted); y -= 13; }
  if (adv.address) { text(adv.address.slice(0, 90), 50, 9, font, muted); y -= 13; }
  y -= 20; text("Advertising balance top-up", 50, 11, bold); text(money(t.amountMinor), 430, 11, bold); y -= 24;
  text("Taxable value", 300, 10, font, muted); text(money(taxable), 430, 10); y -= 15;
  text(`GST @ ${rate}% (included)`, 300, 10, font, muted); text(money(t.amountMinor - taxable), 430, 10); y -= 18;
  text("Total paid", 300, 11, bold); text(money(t.amountMinor), 430, 11, bold); y -= 30;
  text(`Payment reference: ${t.providerPaymentId ?? "—"}`, 50, 9, font, muted); y -= 14;
  text("Unused balance can be refunded on request under the Advertising Terms.", 50, 9, font, muted);
  return Buffer.from(await doc.save());
}

export async function accountSummary(adv: typeof schema.advertisers.$inferSelect) {
  const cs = await db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.advertiserId, adv.id)).orderBy(desc(schema.adCampaigns.createdAt));
  const by = (s: string) => cs.filter((c) => c.status === s).length;
  const stats = await campaignStats(cs.map((c) => c.id));
  return {
    advertiser: { id: adv.id, businessName: adv.businessName, contactName: adv.contactName, email: adv.email, phone: adv.phone, category: adv.category, categoryLabel: AD_CATEGORIES[adv.category as keyof typeof AD_CATEGORIES] ?? adv.category, website: adv.website, address: adv.address, gstin: adv.gstin, verification: adv.verification, status: adv.status, balanceMinor: adv.balanceMinor },
    counts: { total: cs.length, active: by("ACTIVE"), scheduled: by("APPROVED"), drafts: by("DRAFT"), pending: by("PENDING_REVIEW"), rejected: by("REJECTED"), paused: by("PAUSED"), completed: by("COMPLETED") },
    stats,
    campaigns: cs.map(campaignView),
    today: ymd(),
  };
}
