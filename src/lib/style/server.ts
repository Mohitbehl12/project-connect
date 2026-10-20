import "server-only";
import { and, count, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "../audit";
import { mockAllowed, checkoutProvider } from "../billing";
import { open, seal } from "../crypto";
import { ApiError } from "../http";
import { notify } from "../notify";
import { appUrl, signScoped } from "../paytoken";
import * as D from "./darzi.js";

// Kinara Style: custom clothing (merged from the Darzi project).
// Choose clothing → design (catalogue or described in words) → measurements → review → preview → order.
// Prices are always recalculated here from the design; the app's numbers are only for display.

const DAY = 86_400_000;
export const MAX_PROFILES = 10, MAX_DESIGNS = 60;

// ---- validation ---------------------------------------------------------------------------------------
export const SpecBody = z.object({
  category: z.string().refine((c) => !!D.CATS[c], "category: Choose a garment"),
  fabric: z.string().max(60), color: z.string().max(40), collar: z.string().max(60).nullable().optional(), sleeves: z.string().max(40).nullable().optional(),
  buttons: z.string().max(60), pockets: z.string().max(60), fit: z.string().max(30), length: z.string().max(40), pattern: z.string().max(40),
}).transform((s) => D.normalize(s as D.Spec)); // anything not offered for that garment falls back to a valid option

const KEYS = new Set(D.MEAS.map(([k]) => k));
const RANGE: Record<string, [number, number]> = { height: [48, 90] };
const MVal = z.object({ v: z.number().finite(), c: z.enum(["High", "Medium", "Low", "Verified", "Edited"]), u: z.boolean(), src: z.string().max(20).optional(), calibrated: z.boolean().optional() });
export const MeasurementsBody = z.record(z.string(), MVal).superRefine((m, ctx) => {
  for (const [k, x] of Object.entries(m)) {
    if (!KEYS.has(k)) ctx.addIssue({ code: "custom", message: `m: Unknown measurement "${k}"` });
    const [lo, hi] = RANGE[k] ?? [2, 80];
    if (x.v < lo || x.v > hi) ctx.addIssue({ code: "custom", message: `m: ${k} looks wrong (${x.v} in). Check it with a tape.` });
  }
  if (Object.keys(m).length && Object.keys(m).length !== KEYS.size) ctx.addIssue({ code: "custom", message: "m: All 18 measurements are needed." });
});
export const ProfileBody = z.object({
  name: z.string().trim().min(1).max(40), rel: z.enum(["Self", "Family", "Friend", "Client"]).default("Self"),
  fit: z.string().refine((f) => D.FITS.includes(f) || f === "Wide-leg", "fit: Choose a fit").default("Tailored"),
  m: MeasurementsBody.nullable().optional(),
  ref: z.object({ chest: z.string().max(8), shoulder: z.string().max(8), sleeve: z.string().max(8), length: z.string().max(8) }).nullable().optional(),
  method: z.enum(["estimate", "tape", "photo"]).optional(),
});

// ---- preferences ----------------------------------------------------------------------------------------
export async function getPrefs(userId: string) {
  const p = await db.query.stylePrefs.findFirst({ where: eq(schema.stylePrefs.userId, userId) });
  return p ? { fit: p.fit, colors: p.colors ? p.colors.split(",") : [], occasions: p.occasions ? p.occasions.split(",") : [], set: true } : { fit: "Tailored", colors: [], occasions: [], set: false };
}
export async function setPrefs(userId: string, b: { fit: string; colors: string[]; occasions: string[] }) {
  const v = { fit: b.fit, colors: b.colors.filter((c) => D.COLORS[c]).slice(0, 8).join(","), occasions: b.occasions.slice(0, 5).join(","), updatedAt: new Date() };
  await db.insert(schema.stylePrefs).values({ userId, ...v }).onConflictDoUpdate({ target: schema.stylePrefs.userId, set: v });
  return getPrefs(userId);
}

// ---- measurement profiles --------------------------------------------------------------------------------
const profileOut = (p: typeof schema.styleProfiles.$inferSelect) => {
  const d = JSON.parse(p.data || "{}") as { m?: D.Measurements | null; ref?: Record<string, string> | null; method?: string };
  const fs = D.fitScore({ m: d.m ?? null, fit: p.fit, ref: d.ref ?? null });
  return { id: p.id, name: p.name, rel: p.rel, fit: p.fit, m: d.m ?? null, ref: d.ref ?? null, method: d.method ?? null, updatedAt: p.updatedAt, fitScore: fs.score, fitLocked: fs.score === 100, gates: fs.gates };
};
export async function listProfiles(userId: string) {
  return (await db.select().from(schema.styleProfiles).where(eq(schema.styleProfiles.userId, userId)).orderBy(schema.styleProfiles.updatedAt)).map(profileOut);
}
export async function saveProfile(userId: string, id: string | null, b: z.infer<typeof ProfileBody>) {
  const data = JSON.stringify({ m: b.m ?? null, ref: b.ref ?? null, method: b.method ?? null });
  if (id) {
    const [row] = await db.update(schema.styleProfiles).set({ name: b.name, rel: b.rel, fit: b.fit, data, updatedAt: new Date() })
      .where(and(eq(schema.styleProfiles.id, id), eq(schema.styleProfiles.userId, userId))).returning();
    if (!row) throw new ApiError(404, "Measurement profile not found.", "not_found");
    return profileOut(row);
  }
  const [{ n }] = await db.select({ n: count() }).from(schema.styleProfiles).where(eq(schema.styleProfiles.userId, userId));
  if (n >= MAX_PROFILES) throw new ApiError(409, `You can keep up to ${MAX_PROFILES} measurement profiles.`, "limit");
  const [row] = await db.insert(schema.styleProfiles).values({ userId, name: b.name, rel: b.rel, fit: b.fit, data }).returning();
  return profileOut(row);
}
export async function deleteProfile(userId: string, id: string) {
  await db.delete(schema.styleProfiles).where(and(eq(schema.styleProfiles.id, id), eq(schema.styleProfiles.userId, userId)));
}

// ---- designs ------------------------------------------------------------------------------------------------
const designOut = (d: typeof schema.styleDesigns.$inferSelect) => {
  const spec = JSON.parse(d.spec) as D.Spec;
  return { id: d.id, name: d.name, spec, prompt: d.prompt, price: D.price(spec), description: D.describe(spec), createdAt: d.createdAt };
};
export async function listDesigns(userId: string) {
  return (await db.select().from(schema.styleDesigns).where(eq(schema.styleDesigns.userId, userId)).orderBy(desc(schema.styleDesigns.createdAt)).limit(MAX_DESIGNS)).map(designOut);
}
export async function saveDesign(userId: string, spec: D.Spec, name: string | undefined, prompt: string | undefined) {
  const [{ n }] = await db.select({ n: count() }).from(schema.styleDesigns).where(eq(schema.styleDesigns.userId, userId));
  if (n >= MAX_DESIGNS) throw new ApiError(409, `You can keep up to ${MAX_DESIGNS} designs. Delete one to save another.`, "limit");
  const [row] = await db.insert(schema.styleDesigns).values({ userId, name: (name?.trim() || D.title(spec)).slice(0, 60), spec: JSON.stringify(spec), prompt: prompt?.slice(0, 500) ?? null }).returning();
  return designOut(row);
}
export async function deleteDesign(userId: string, id: string) {
  await db.delete(schema.styleDesigns).where(and(eq(schema.styleDesigns.id, id), eq(schema.styleDesigns.userId, userId)));
}

// ---- orders -------------------------------------------------------------------------------------------------
const orderOut = (o: typeof schema.styleOrders.$inferSelect, opts: { measurements?: boolean } = {}) => {
  const spec = JSON.parse(o.spec) as D.Spec;
  return {
    id: o.id, spec, description: D.describe(spec), garment: D.CATS[spec.category]?.one ?? spec.category, profileName: o.profileName,
    priceMinor: o.priceMinor, currency: o.currency, status: o.status, statusLabel: D.STATUSES[o.status] ?? "", statuses: D.STATUSES,
    paymentStatus: o.paymentStatus, fitLocked: o.fitLocked, notes: o.notes, eta: o.eta, createdAt: o.createdAt, feedback: o.feedback ? JSON.parse(o.feedback) : null,
    ...(opts.measurements ? { measurements: JSON.parse(o.measurements), finished: D.finished(spec, JSON.parse(o.measurements), {}) } : {}),
  };
};

/** Price check before ordering: what it costs, how long it takes. */
export function quoteFor(spec: D.Spec) {
  const c = D.CATS[spec.category];
  return { priceMinor: D.price(spec) * 100, currency: "INR", days: c.days, description: D.describe(spec), garment: c.one };
}

async function nextOrderId() {
  const [{ n }] = await db.select({ n: count() }).from(schema.styleOrders);
  return `KN-${25001 + n}`;
}

export async function createOrder(user: User, b: { spec: D.Spec; profileId: string; notes?: string; address: string }) {
  const p = await db.query.styleProfiles.findFirst({ where: and(eq(schema.styleProfiles.id, b.profileId), eq(schema.styleProfiles.userId, user.id)) });
  if (!p) throw new ApiError(404, "Choose whose measurements to use.", "no_profile");
  const prof = profileOut(p);
  if (!prof.m) throw new ApiError(422, "Add measurements to this profile first.", "no_measurements");
  const q = quoteFor(b.spec);
  let id = await nextOrderId();
  for (let i = 0; i < 5; i++) {
    try {
      await db.insert(schema.styleOrders).values({
        id, userId: user.id, profileId: p.id, profileName: p.name, spec: JSON.stringify(b.spec), measurements: JSON.stringify(prof.m),
        priceMinor: q.priceMinor, currency: q.currency, notes: (b.notes ?? "").slice(0, 600), fitLocked: prof.fitLocked, address: seal(b.address.slice(0, 400), id),
      });
      break;
    } catch { id = `KN-${25001 + Math.floor(Math.random() * 1e6)}`; }
  }
  await db.insert(schema.styleOrderEvents).values({ orderId: id, status: 0, note: "Order placed, waiting for payment", byId: user.id });
  await audit(user.id, "style.order_created", "style_order", id, { priceMinor: q.priceMinor });
  return { order: orderOut((await db.query.styleOrders.findFirst({ where: eq(schema.styleOrders.id, id) }))!), payUrl: await payUrlFor(user.id, id) };
}

async function payUrlFor(userId: string, orderId: string) {
  return `${appUrl()}/style/pay/${orderId}?t=${encodeURIComponent(await signScoped("pay", userId, `style:${orderId}`))}`;
}

export async function myOrders(userId: string) {
  return (await db.select().from(schema.styleOrders).where(eq(schema.styleOrders.userId, userId)).orderBy(desc(schema.styleOrders.createdAt)).limit(100)).map((o) => orderOut(o));
}
export async function myOrder(userId: string, id: string) {
  const o = await db.query.styleOrders.findFirst({ where: and(eq(schema.styleOrders.id, id), eq(schema.styleOrders.userId, userId)) });
  if (!o) throw new ApiError(404, "Order not found.", "not_found");
  const events = await db.select().from(schema.styleOrderEvents).where(eq(schema.styleOrderEvents.orderId, id)).orderBy(schema.styleOrderEvents.at);
  return { ...orderOut(o, { measurements: true }), events: events.map((e) => ({ status: e.status, label: D.STATUSES[e.status], note: e.note, at: e.at })), payUrl: o.paymentStatus === "PENDING" ? await payUrlFor(userId, id) : null };
}

/** What the hosted pay page needs (never secrets). Starts the gateway order on first open. */
export async function payInfo(userId: string, id: string) {
  const o = await db.query.styleOrders.findFirst({ where: and(eq(schema.styleOrders.id, id), eq(schema.styleOrders.userId, userId)) });
  if (!o) throw new ApiError(404, "Order not found.", "not_found");
  const user = (await db.query.users.findFirst({ where: eq(schema.users.id, userId) }))!;
  const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, userId) });
  const provider = mockAllowed() && !process.env.RAZORPAY_KEY_ID ? "MOCK" : checkoutProvider().name;
  let client: Record<string, unknown> | null = null;
  if (o.paymentStatus === "PENDING" && provider === "RAZORPAY") {
    const session = await checkoutProvider().createCheckout({
      ourPaymentId: o.id, ourSubscriptionId: `style:${o.id}`, kind: "PASS", planCode: "STYLE", planName: `Kinara Style order ${o.id}`,
      currency: o.currency, todayMinor: o.priceMinor, regularMinor: o.priceMinor, periodDays: 0, firstChargeAt: null, providerPlanId: null,
      customer: { name: profile?.firstName ?? "", email: user.email, phone: user.phone ?? null },
    });
    await db.update(schema.styleOrders).set({ providerOrderId: session.providerRef }).where(eq(schema.styleOrders.id, o.id));
    client = session.client;
  }
  const spec = JSON.parse(o.spec) as D.Spec;
  return { order: { id: o.id, priceMinor: o.priceMinor, currency: o.currency, description: D.describe(spec), paymentStatus: o.paymentStatus }, provider, razorpay: client };
}

export async function markOrderPaid(id: string, ref: string, test: boolean) {
  const o = await db.query.styleOrders.findFirst({ where: eq(schema.styleOrders.id, id) });
  if (!o || o.paymentStatus === "PAID" || o.paymentStatus === "TEST_PAID") return o ? "already" : "missing";
  const spec = JSON.parse(o.spec) as D.Spec;
  const eta = new Date(Date.now() + (D.CATS[spec.category]?.days ?? 10) * DAY + 2 * DAY);
  await db.update(schema.styleOrders).set({ paymentStatus: test ? "TEST_PAID" : "PAID", paymentRef: ref, status: Math.max(o.status, 1), eta, updatedAt: new Date() }).where(eq(schema.styleOrders.id, id));
  await db.insert(schema.styleOrderEvents).values({ orderId: id, status: 1, note: test ? "Test payment (no money taken)" : "Payment received" });
  await notify(o.userId, "SUBSCRIPTION", `Order ${id} confirmed`, `Payment received. Your ${D.CATS[spec.category]?.one.toLowerCase() ?? "outfit"} should reach you by ${eta.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`, `/style/orders/${id}`);
  await audit(null, "style.order_paid", "style_order", id, { test });
  return "paid";
}

/** Razorpay webhook / return: a captured payment for one of our clothing orders. */
export async function captureByProviderOrder(providerOrderId: string, paymentId: string) {
  const o = await db.query.styleOrders.findFirst({ where: eq(schema.styleOrders.providerOrderId, providerOrderId) });
  if (!o) return null;
  return markOrderPaid(o.id, paymentId, false);
}

export async function verifyClientPayment(userId: string, id: string, paymentId: string, signature: string) {
  const o = await db.query.styleOrders.findFirst({ where: and(eq(schema.styleOrders.id, id), eq(schema.styleOrders.userId, userId)) });
  if (!o?.providerOrderId) throw new ApiError(404, "Order not found.", "not_found");
  if (!checkoutProvider().verifyClientResult({ providerRef: o.providerOrderId, kind: "PASS", paymentId, signature })) throw new ApiError(400, "We couldn't confirm that payment. If money was taken, it will show up within a few minutes.", "bad_signature");
  return markOrderPaid(o.id, paymentId, false);
}

export async function testPay(userId: string, id: string) {
  if (!mockAllowed()) throw new ApiError(403, "Test payments are switched off.", "payments_live");
  const o = await db.query.styleOrders.findFirst({ where: and(eq(schema.styleOrders.id, id), eq(schema.styleOrders.userId, userId)) });
  if (!o) throw new ApiError(404, "Order not found.", "not_found");
  return markOrderPaid(o.id, `test_${o.id}`, true);
}

export async function leaveFeedback(userId: string, id: string, b: { fit: "PERFECT" | "TIGHT" | "LOOSE"; rating: number; note: string }) {
  const o = await db.query.styleOrders.findFirst({ where: and(eq(schema.styleOrders.id, id), eq(schema.styleOrders.userId, userId)) });
  if (!o) throw new ApiError(404, "Order not found.", "not_found");
  if (o.status < D.STATUSES.length - 1) throw new ApiError(409, "You can tell us how it fits once it's delivered.", "not_delivered");
  await db.update(schema.styleOrders).set({ feedback: JSON.stringify({ ...b, note: b.note.slice(0, 600), at: new Date() }), updatedAt: new Date() }).where(eq(schema.styleOrders.id, id));
  if (b.fit !== "PERFECT" && o.fitLocked) await notify(userId, "SUBSCRIPTION", "We'll make it right", `Your order was Fit Locked, so the alteration or remake is free. Our workshop will contact you about ${id}.`, `/style/orders/${id}`);
  return { saved: true };
}

// ---- workshop (admin) -------------------------------------------------------------------------------------
export async function adminOrders(filter: "open" | "all" | "late", withMeasurements: boolean) {
  const paid = inArray(schema.styleOrders.paymentStatus, ["PAID", "TEST_PAID"]);
  const where = filter === "open" ? and(paid, lt(schema.styleOrders.status, D.STATUSES.length - 1))
    : filter === "late" ? and(paid, lt(schema.styleOrders.status, 5), lt(schema.styleOrders.eta, new Date())) : undefined;
  const rows = await db.select({ o: schema.styleOrders, name: schema.profiles.firstName }).from(schema.styleOrders)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.styleOrders.userId)).where(where).orderBy(desc(schema.styleOrders.createdAt)).limit(300);
  return rows.map(({ o, name }) => ({ ...orderOut(o, { measurements: withMeasurements }), customer: { id: o.userId, name: name ?? "Member" }, address: withMeasurements ? open(o.address, o.id) : undefined }));
}

export async function adminSetStatus(staff: User, id: string, status: number, note: string) {
  if (!Number.isInteger(status) || status < 0 || status >= D.STATUSES.length) throw new ApiError(422, "status: Invalid status.", "validation");
  const o = await db.query.styleOrders.findFirst({ where: eq(schema.styleOrders.id, id) });
  if (!o) throw new ApiError(404, "Order not found.", "not_found");
  if (o.paymentStatus === "PENDING") throw new ApiError(409, "This order hasn't been paid yet.", "unpaid");
  await db.update(schema.styleOrders).set({ status, updatedAt: new Date() }).where(eq(schema.styleOrders.id, id));
  await db.insert(schema.styleOrderEvents).values({ orderId: id, status, note: note.slice(0, 300) || null, byId: staff.id });
  const label = D.STATUSES[status];
  await notify(o.userId, "SUBSCRIPTION", `${id}: ${label}`, status === 5 ? "Your order is on its way." : status === 6 ? "Delivered. Tell us how it fits!" : `Your order is now at "${label}".`, `/style/orders/${id}`);
  await audit(staff.id, "style.order_status", "style_order", id, { status: label });
  return orderOut((await db.query.styleOrders.findFirst({ where: eq(schema.styleOrders.id, id) }))!);
}

export async function adminCustomers() {
  const rows = await db.select({ userId: schema.styleOrders.userId, n: count(), total: sql<number>`sum(${schema.styleOrders.priceMinor})` })
    .from(schema.styleOrders).where(inArray(schema.styleOrders.paymentStatus, ["PAID", "TEST_PAID"])).groupBy(schema.styleOrders.userId);
  const ids = rows.map((r) => r.userId);
  const names = ids.length ? await db.select({ id: schema.profiles.userId, name: schema.profiles.firstName, city: schema.profiles.city }).from(schema.profiles).where(inArray(schema.profiles.userId, ids)) : [];
  const profs = ids.length ? await db.select({ userId: schema.styleProfiles.userId, n: count() }).from(schema.styleProfiles).where(inArray(schema.styleProfiles.userId, ids)).groupBy(schema.styleProfiles.userId) : [];
  return rows.map((r) => ({ id: r.userId, name: names.find((x) => x.id === r.userId)?.name ?? "Member", city: names.find((x) => x.id === r.userId)?.city ?? "", orders: r.n, spentMinor: Number(r.total ?? 0), profiles: profs.find((p) => p.userId === r.userId)?.n ?? 0 }));
}

export async function adminDesigns() {
  const rows = await db.select({ d: schema.styleDesigns, name: schema.profiles.firstName }).from(schema.styleDesigns).leftJoin(schema.profiles, eq(schema.profiles.userId, schema.styleDesigns.userId)).orderBy(desc(schema.styleDesigns.createdAt)).limit(200);
  return rows.map(({ d, name }) => ({ ...designOut(d), by: name ?? "Member" }));
}

export async function adminMeasurementProfiles() {
  const rows = await db.select({ p: schema.styleProfiles, name: schema.profiles.firstName }).from(schema.styleProfiles).leftJoin(schema.profiles, eq(schema.profiles.userId, schema.styleProfiles.userId)).orderBy(desc(schema.styleProfiles.updatedAt)).limit(300);
  return rows.map(({ p, name }) => ({ ...profileOut(p), owner: name ?? "Member" }));
}

export async function adminReports() {
  const paid = inArray(schema.styleOrders.paymentStatus, ["PAID", "TEST_PAID"]);
  const [byStatus, totals, cats, late, pending] = await Promise.all([
    db.select({ status: schema.styleOrders.status, n: count() }).from(schema.styleOrders).where(paid).groupBy(schema.styleOrders.status),
    db.select({ n: count(), revenue: sql<number>`sum(${schema.styleOrders.priceMinor})` }).from(schema.styleOrders).where(and(paid, ne(schema.styleOrders.paymentStatus, "TEST_PAID"))),
    db.select({ spec: schema.styleOrders.spec }).from(schema.styleOrders).where(paid),
    db.select({ n: count() }).from(schema.styleOrders).where(and(paid, lt(schema.styleOrders.status, 5), lt(schema.styleOrders.eta, new Date()))),
    db.select({ n: count() }).from(schema.styleOrders).where(eq(schema.styleOrders.paymentStatus, "PENDING")),
  ]);
  const byCat: Record<string, number> = {};
  for (const c of cats) { const k = (JSON.parse(c.spec) as D.Spec).category; byCat[k] = (byCat[k] ?? 0) + 1; }
  const [{ n: testOrders }] = await db.select({ n: count() }).from(schema.styleOrders).where(eq(schema.styleOrders.paymentStatus, "TEST_PAID"));
  return {
    statuses: D.STATUSES, byStatus: D.STATUSES.map((label, i) => ({ label, n: byStatus.find((b) => b.status === i)?.n ?? 0 })),
    paidOrders: totals[0]?.n ?? 0, revenueMinor: Number(totals[0]?.revenue ?? 0), testOrders, unpaid: pending[0].n, late: late[0].n,
    categories: Object.entries(byCat).map(([k, n]) => ({ category: D.CATS[k]?.one ?? k, n })).sort((a, b) => b.n - a.n),
  };
}

export const FabricBody = z.object({ name: z.string().trim().min(1).max(60), color: z.string().trim().min(1).max(40), stockM: z.number().min(0).max(100000), reorderM: z.number().min(0).max(10000), costPerM: z.number().int().min(0).max(1_000_000) });
export async function listFabrics() { return db.select().from(schema.styleFabrics).orderBy(schema.styleFabrics.name, schema.styleFabrics.color); }
