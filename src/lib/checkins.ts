import "server-only";
import { and, count, eq, inArray, lt, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { COUNTRIES } from "./constants";
import { open, seal } from "./crypto";
import { sendEmail, simpleEmail } from "./email";
import { ApiError } from "./http-error";
import { screenMessage } from "./moderation";
import { notify } from "./notify";

// Date check-in. A member names a trusted contact (email), the date's place and time, and when they expect to be
// done. At that time we ask "Are you OK?". If they don't answer within the grace period, we email the contact.
// We never contact emergency services, never tell the contact who the date is with, and delete the contact's
// address 7 days after the date. The member can say "I'm safe", add time, or cancel at any point.

export const CheckinBody = z.object({
  matchId: z.string().uuid().optional(),
  datePlanId: z.string().uuid().optional(),
  place: z.string().trim().min(2).max(120),
  startsAt: z.string().datetime({ offset: true }),
  checkInAt: z.string().datetime({ offset: true }),
  graceMinutes: z.number().int().min(10).max(120).default(30),
  contactName: z.string().trim().min(1).max(60),
  contactEmail: z.string().trim().toLowerCase().email().max(200),
  contactAgreed: z.literal(true, { message: "Please confirm your contact knows you're adding them." }),
  tellContactNow: z.boolean().default(true),
});
export type CheckinInput = z.infer<typeof CheckinBody>;

const ACTIVE = ["SCHEDULED", "ASKED", "ALERTED"];
const appUrl = () => process.env.APP_URL ?? "";

async function tzFor(userId: string) {
  const p = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, userId), columns: { country: true, firstName: true } });
  return { tz: COUNTRIES[p?.country ?? ""]?.tz ?? "UTC", firstName: p?.firstName ?? "Your friend" };
}
const when = (d: Date, tz: string) => d.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz });

export async function createCheckin(userId: string, b: CheckinInput) {
  const startsAt = new Date(b.startsAt), checkInAt = new Date(b.checkInAt), now = Date.now();
  if (startsAt.getTime() < now - 6 * 3600_000 || startsAt.getTime() > now + 30 * 86400_000) throw new ApiError(422, "startsAt: Pick a date in the next 30 days.", "validation");
  if (checkInAt.getTime() < now + 10 * 60_000) throw new ApiError(422, "checkInAt: Pick a check-in time at least 10 minutes from now.", "validation");
  if (checkInAt.getTime() <= startsAt.getTime()) throw new ApiError(422, "checkInAt: The check-in should be after the date starts.", "validation");
  if (checkInAt.getTime() > startsAt.getTime() + 12 * 3600_000) throw new ApiError(422, "checkInAt: Pick a check-in within 12 hours of the start.", "validation");
  const flags = screenMessage(`${b.place} ${b.contactName}`);
  if (flags.includes("LINK") || flags.includes("RISKY_LINK") || flags.includes("CONTACT_INFO")) throw new ApiError(422, "place: Enter just the venue name and area.", "validation");
  if (b.matchId) {
    const m = await db.query.matches.findFirst({ where: eq(schema.matches.id, b.matchId) });
    if (!m || (m.userAId !== userId && m.userBId !== userId)) throw new ApiError(404, "Match not found.", "not_found");
  }
  if (b.datePlanId) {
    const d = await db.query.datePlans.findFirst({ where: eq(schema.datePlans.id, b.datePlanId) });
    const m = d && await db.query.matches.findFirst({ where: eq(schema.matches.id, d.matchId) });
    if (!m || (m.userAId !== userId && m.userBId !== userId)) throw new ApiError(404, "Date not found.", "not_found");
  }
  const me = await db.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { email: true } });
  if (me?.email.toLowerCase() === b.contactEmail) throw new ApiError(422, "contactEmail: Your contact should be someone else — a friend or family member.", "validation");
  const [{ n }] = await db.select({ n: count() }).from(schema.dateCheckins).where(and(eq(schema.dateCheckins.userId, userId), inArray(schema.dateCheckins.status, ACTIVE)));
  if (n >= 3) throw new ApiError(429, "You already have 3 check-ins running. Finish or cancel one first.", "too_many");

  const [c] = await db.insert(schema.dateCheckins).values({
    userId, matchId: b.matchId ?? null, datePlanId: b.datePlanId ?? null, place: b.place, startsAt, checkInAt, graceMinutes: b.graceMinutes,
    contactName: b.contactName, contactEmail: seal(b.contactEmail, `checkin:${userId}`),
  }).returning();
  const { tz, firstName } = await tzFor(userId);
  if (b.tellContactNow) {
    const e = simpleEmail(`${firstName} added you as their safety contact`, [
      `Hi ${b.contactName}, ${firstName} is meeting someone from Kinara at ${b.place}, ${when(startsAt, tz)}.`,
      `They plan to check in by ${when(checkInAt, tz)}. If they don't, we'll email you so you can reach out to them.`,
      "You don't need to do anything now. We don't share who they are meeting, and we'll delete your email address a week after the date.",
    ]);
    await sendEmail(b.contactEmail, `${firstName} added you as their safety contact`, e.text, e.html);
  }
  await audit(userId, "safety.checkin.create", "date_checkin", c.id, { tellContactNow: b.tellContactNow });
  return { checkin: view(c), share: shareText(firstName, b.place, startsAt, checkInAt, tz) };
}

/** What the member can paste into WhatsApp/SMS themselves (we never send texts on their behalf). */
export function shareText(firstName: string, place: string, startsAt: Date, checkInAt: Date, tz: string) {
  return `Hi! I'm on a date at ${place}, ${when(startsAt, tz)}. I'll check in on Kinara by ${when(checkInAt, tz)} — if you hear from Kinara that I haven't, please call me. — ${firstName}`;
}

export function view(c: typeof schema.dateCheckins.$inferSelect) {
  return { id: c.id, matchId: c.matchId, datePlanId: c.datePlanId, place: c.place, startsAt: c.startsAt, checkInAt: c.checkInAt, graceMinutes: c.graceMinutes, contactName: c.contactName, status: c.status, askedAt: c.askedAt, safeAt: c.safeAt, alertedAt: c.alertedAt };
}

export async function listCheckins(userId: string) {
  const rows = await db.select().from(schema.dateCheckins).where(eq(schema.dateCheckins.userId, userId)).orderBy(schema.dateCheckins.checkInAt);
  return rows.filter((r) => ACTIVE.includes(r.status) || r.startsAt.getTime() > Date.now() - 2 * 86400_000).map(view);
}

export async function actOnCheckin(userId: string, id: string, action: "safe" | "extend" | "cancel", minutes = 30) {
  const c = await db.query.dateCheckins.findFirst({ where: and(eq(schema.dateCheckins.id, id), eq(schema.dateCheckins.userId, userId)) });
  if (!c) throw new ApiError(404, "Check-in not found.", "not_found");
  if (!ACTIVE.includes(c.status)) throw new ApiError(409, "This check-in has already ended.", "conflict");
  const { firstName } = await tzFor(userId);
  const contact = c.contactEmail ? open(c.contactEmail, `checkin:${userId}`) : null;
  if (action === "safe") {
    await db.update(schema.dateCheckins).set({ status: "SAFE", safeAt: new Date() }).where(eq(schema.dateCheckins.id, c.id));
    if (c.status === "ALERTED" && contact) {
      const e = simpleEmail(`${firstName} has checked in`, [`Good news, ${c.contactName}: ${firstName} has just checked in on Kinara and says they're safe.`]);
      await sendEmail(contact, `${firstName} has checked in safely`, e.text, e.html);
    }
  } else if (action === "extend") {
    if (c.status === "ALERTED") throw new ApiError(409, "Your contact has already been told. Tap \"I'm safe\" to let them know.", "conflict");
    const at = new Date(Math.max(Date.now(), c.checkInAt.getTime()) + minutes * 60_000);
    if (at.getTime() > c.startsAt.getTime() + 24 * 3600_000) throw new ApiError(422, "minutes: That's more than a day after the date started.", "validation");
    await db.update(schema.dateCheckins).set({ status: "SCHEDULED", checkInAt: at, askedAt: null }).where(eq(schema.dateCheckins.id, c.id));
  } else {
    await db.update(schema.dateCheckins).set({ status: "CANCELLED" }).where(eq(schema.dateCheckins.id, c.id));
    if (c.status === "ALERTED" && contact) {
      const e = simpleEmail(`${firstName} has checked in`, [`${c.contactName}, ${firstName} has closed their date check-in on Kinara, so they're able to use the app.`]);
      await sendEmail(contact, `Update from ${firstName}`, e.text, e.html);
    }
  }
  await audit(userId, `safety.checkin.${action}`, "date_checkin", c.id, {});
  const after = await db.query.dateCheckins.findFirst({ where: eq(schema.dateCheckins.id, c.id) });
  return view(after!);
}

/** Runs every 5 minutes (cron): ask, then alert, then forget the contact's address. */
export async function runDateSafety(now = new Date()) {
  let asked = 0, alerted = 0;
  for (const c of await db.select().from(schema.dateCheckins).where(and(eq(schema.dateCheckins.status, "SCHEDULED"), lte(schema.dateCheckins.checkInAt, now))).limit(200)) {
    const done = await db.update(schema.dateCheckins).set({ status: "ASKED", askedAt: now }).where(and(eq(schema.dateCheckins.id, c.id), eq(schema.dateCheckins.status, "SCHEDULED"))).returning({ id: schema.dateCheckins.id });
    if (!done.length) continue; // another run got it
    await notify(c.userId, "SAFETY", "Are you OK?", `Tap to check in after your date at ${c.place}. If we don't hear from you in ${c.graceMinutes} minutes, we'll let ${c.contactName} know.`, `/checkin/${c.id}`);
    asked++;
  }
  for (const c of await db.select().from(schema.dateCheckins).where(eq(schema.dateCheckins.status, "ASKED")).limit(200)) {
    if (!c.askedAt || c.askedAt.getTime() + c.graceMinutes * 60_000 > now.getTime()) continue;
    const done = await db.update(schema.dateCheckins).set({ status: "ALERTED", alertedAt: now }).where(and(eq(schema.dateCheckins.id, c.id), eq(schema.dateCheckins.status, "ASKED"))).returning({ id: schema.dateCheckins.id });
    if (!done.length) continue;
    const { tz, firstName } = await tzFor(c.userId);
    const e = simpleEmail(`${firstName} hasn't checked in`, [
      `Hi ${c.contactName}, ${firstName} planned to check in on Kinara by ${when(c.checkInAt, tz)} after meeting someone at ${c.place} (${when(c.startsAt, tz)}).`,
      "They haven't answered yet. They may simply have forgotten — please try calling or messaging them.",
      "If you can't reach them and you're worried, contact local emergency services yourself (112 in India). Kinara does not contact them for you.",
    ]);
    const sent = await sendEmail(open(c.contactEmail, `checkin:${c.userId}`), `${firstName} hasn't checked in after their date`, e.text, e.html);
    await notify(c.userId, "SAFETY", "We've told your safety contact", `You didn't check in, so we emailed ${c.contactName}. Tap "I'm safe" to let them know you're OK.`, `/checkin/${c.id}`);
    await audit(null, "safety.checkin.alert", "date_checkin", c.id, { emailed: sent });
    alerted++;
  }
  // An alert nobody answered stays open for two days, then closes on its own.
  await db.update(schema.dateCheckins).set({ status: "EXPIRED" }).where(and(inArray(schema.dateCheckins.status, ACTIVE), lt(schema.dateCheckins.startsAt, new Date(now.getTime() - 2 * 86400_000))));
  // Forget contacts' addresses a week after the date; drop finished check-ins after 30 days.
  await db.update(schema.dateCheckins).set({ contactEmail: "" }).where(and(lt(schema.dateCheckins.startsAt, new Date(now.getTime() - 7 * 86400_000)), ne(schema.dateCheckins.contactEmail, "")));
  await db.delete(schema.dateCheckins).where(and(lt(schema.dateCheckins.startsAt, new Date(now.getTime() - 30 * 86400_000)), inArray(schema.dateCheckins.status, ["SAFE", "CANCELLED", "EXPIRED"])));
  return { asked, alerted };
}
