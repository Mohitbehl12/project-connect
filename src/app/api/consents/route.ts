import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, clientIp, ok, parseBody, route } from "@/lib/http";
import { CONSENT_KINDS, consentSummary, recordConsent, type ConsentKind } from "@/lib/consent";

/** Your consents: what's on, when you said so, and the full history. */
export const GET = route(async ({ user }) => ok(await consentSummary(user.id)), { allowSuspended: true, allowOnboarding: true });

const Body = z.object({
  kind: z.enum(Object.keys(CONSENT_KINDS) as [ConsentKind, ...ConsentKind[]]),
  granted: z.boolean(),
  source: z.enum(["app", "web"]).default("app"),
});

/** Give or withdraw an optional consent. Required ones (terms, age) can't be withdrawn here — delete the account instead. */
export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  const def = CONSENT_KINDS[b.kind];
  if (!def.withdrawable) throw new ApiError(422, "This one is needed to use Kinara. To withdraw it, delete your account in Privacy Center.", "required_consent");
  await recordConsent(user.id, b.kind, b.granted, { source: b.source, ip: await clientIp(), version: b.kind === "MARKETING" ? "marketing-v1" : undefined });
  if (b.kind === "MARKETING") await db.update(schema.preferences).set({ marketing: b.granted }).where(eq(schema.preferences.userId, user.id));
  if (b.kind === "PROFILE_VISIBLE") await db.update(schema.preferences).set({ discoverable: b.granted }).where(eq(schema.preferences.userId, user.id));
  if (b.kind === "LOCATION") await db.update(schema.preferences).set({ showDistance: b.granted }).where(eq(schema.preferences.userId, user.id));
  if (b.kind === "VIDEO_CALLS" && !b.granted) await db.update(schema.preferences).set({ callRequests: "NOBODY" }).where(eq(schema.preferences.userId, user.id));
  return ok(await consentSummary(user.id));
}, { allowSuspended: true, allowOnboarding: true });
