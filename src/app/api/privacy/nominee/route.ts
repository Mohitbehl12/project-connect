import { z } from "zod";
import { audit } from "@/lib/audit";
import { ok, parseBody, route } from "@/lib/http";
import { RELATIONSHIPS, myNominee, removeNominee, setNominee } from "@/lib/nominee";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  name: z.string().trim().min(2, "Enter their full name.").max(80),
  relationship: z.enum(RELATIONSHIPS),
  contact: z.string().trim().max(120).refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^\+?[\d\s-]{8,16}$/.test(v), "Enter an email address or phone number."),
});

/** Who can act on my data if I can't (DPDP Act s.14). */
export const GET = route(async ({ user }) => ok({ nominee: await myNominee(user.id), relationships: RELATIONSHIPS }), { allowSuspended: true });

export const PUT = route(async ({ req, user }) => {
  await rateLimit(`nominee:${user.id}`, 10, 60 * 60_000);
  const b = await parseBody(req, Body);
  const nominee = await setNominee(user.id, b);
  await audit(user.id, "privacy.nominee_set", "user", user.id, { relationship: b.relationship }); // no name or contact in the log
  return ok({ nominee });
}, { allowSuspended: true, allowOnboarding: true });

export const DELETE = route(async ({ user }) => {
  const removed = await removeNominee(user.id);
  if (removed) await audit(user.id, "privacy.nominee_removed", "user", user.id);
  return ok({ nominee: null });
}, { allowSuspended: true, allowOnboarding: true });
