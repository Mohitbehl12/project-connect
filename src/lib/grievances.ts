import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { getConfig } from "./config";
import { open, seal } from "./crypto";
import { emailConfigured, sendEmail, simpleEmail } from "./email";
import { ApiError } from "./http";

const HOUR = 3_600_000, DAY = 24 * HOUR;
export const GRIEVANCE_CATEGORIES = {
  ACCOUNT: "My account (suspension, verification, access)",
  CONTENT: "Something someone posted or sent",
  INTIMATE_OR_IMPERSONATION: "Intimate images of me, or someone pretending to be me",
  PRIVACY: "My personal data",
  PAYMENT: "Payments or refunds",
  SAFETY: "My safety",
  OTHER: "Something else",
} as const;
export type GrievanceCategory = keyof typeof GRIEVANCE_CATEGORIES;

const refNo = (d: Date) => `GR-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;

/** Files a complaint and acknowledges it at once (with the reference number), as the IT Rules require within 24 hours. */
export async function fileGrievance(input: { name: string; email: string; category: GrievanceCategory; details: string; userId?: string | null }) {
  const now = new Date();
  // Intimate images and impersonation must be acted on within 24 hours; everything else within 15 days.
  const resolveDueAt = new Date(now.getTime() + (input.category === "INTIMATE_OR_IMPERSONATION" ? DAY : 15 * DAY));
  const ref = refNo(now);
  const [g] = await db.insert(schema.grievances).values({
    refNo: ref, userId: input.userId ?? null, name: input.name.trim(), email: seal(input.email.trim().toLowerCase(), ref), category: input.category,
    details: seal(input.details.trim(), ref), status: "ACKNOWLEDGED", ackDueAt: new Date(now.getTime() + DAY), resolveDueAt, acknowledgedAt: now,
  }).returning();
  await audit(input.userId ?? null, "grievance.filed", "grievance", g.id, { ref, category: input.category });
  const c = await getConfig("legal.contacts");
  const officer = c.grievanceOfficer.name || "our Grievance Officer";
  const due = resolveDueAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  if (emailConfigured()) {
    const m = simpleEmail(`We've received your complaint ${ref}`, [
      `Hello ${input.name.trim()},`,
      `Your complaint is with ${officer}. Your reference number is ${ref}.`,
      `We will reply by ${due}. Keep this number if you write to us about it.`,
    ]);
    await sendEmail(input.email, `Complaint received — ${ref}`, m.text, m.html).catch(() => false);
  }
  return { refNo: ref, acknowledgedAt: now, resolveDueAt };
}

export async function listGrievances(status: "open" | "closed") {
  const rows = await db.select().from(schema.grievances)
    .where(inArray(schema.grievances.status, status === "open" ? ["ACKNOWLEDGED", "IN_PROGRESS"] : ["RESOLVED", "REJECTED"]))
    .orderBy(asc(schema.grievances.resolveDueAt)).limit(200);
  const now = Date.now();
  return rows.map((g) => ({
    id: g.id, refNo: g.refNo, name: g.name, email: open(g.email, g.refNo), category: g.category, categoryLabel: GRIEVANCE_CATEGORIES[g.category as GrievanceCategory] ?? g.category,
    details: open(g.details, g.refNo), status: g.status, createdAt: g.createdAt, resolveDueAt: g.resolveDueAt, resolvedAt: g.resolvedAt,
    resolution: g.resolution ? open(g.resolution, g.refNo) : null, hasAccount: !!g.userId,
    overdue: !g.resolvedAt && g.resolveDueAt.getTime() < now, hoursLeft: Math.round((g.resolveDueAt.getTime() - now) / HOUR),
  }));
}

/** Staff move a complaint on. Resolving or rejecting needs a written reply, which is emailed to the person. */
export async function updateGrievance(staffId: string, id: string, action: "progress" | "resolve" | "reject", reply?: string) {
  const g = await db.query.grievances.findFirst({ where: eq(schema.grievances.id, id) });
  if (!g) throw new ApiError(404, "Complaint not found.", "not_found");
  if (g.status === "RESOLVED" || g.status === "REJECTED") throw new ApiError(409, "This complaint is already closed.", "closed");
  if (action !== "progress" && (!reply || reply.trim().length < 10)) throw new ApiError(422, "Write the reply the person will receive (at least 10 characters).", "reply_required");
  const now = new Date();
  const status = action === "progress" ? "IN_PROGRESS" : action === "resolve" ? "RESOLVED" : "REJECTED";
  await db.update(schema.grievances).set({
    status, handledById: staffId, ...(action === "progress" ? {} : { resolvedAt: now, resolution: seal(reply!.trim(), g.refNo) }),
  }).where(and(eq(schema.grievances.id, id), inArray(schema.grievances.status, ["ACKNOWLEDGED", "IN_PROGRESS"])));
  await audit(staffId, `grievance.${action}`, "grievance", id, { ref: g.refNo });
  if (action !== "progress" && emailConfigured()) {
    const m = simpleEmail(`Update on your complaint ${g.refNo}`, [`Hello ${g.name},`, reply!.trim(), "If you're not satisfied with this reply, you can write back quoting your reference number."]);
    await sendEmail(open(g.email, g.refNo), `Your complaint ${g.refNo}`, m.text, m.html).catch(() => false);
  }
  return { status };
}
