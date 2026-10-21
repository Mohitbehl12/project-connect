import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { APPEAL_KINDS, fileAppeal, myAppeals, type AppealKind } from "@/lib/appeals";
import { ApiError, clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  kind: z.enum(Object.keys(APPEAL_KINDS) as [AppealKind, ...AppealKind[]]),
  refId: z.string().max(64).optional(),
  details: z.string().trim().min(20, "Please explain in a few sentences why you think the decision was wrong.").max(4000),
  email: z.string().trim().toLowerCase().email().max(120).optional(), // only when you can't sign in (banned)
});

/**
 * File an appeal. Signed-in members (including suspended ones) appeal from Safety; banned members, who
 * can't sign in, appeal with the email address on their account.
 */
export const POST = publicRoute(async ({ req }) => {
  await rateLimit(`appeal:${await clientIp()}`, 5, 60 * 60_000);
  const b = await parseBody(req, Body);
  const user = await currentUser().catch(() => null);
  if (!user && !b.email) throw new ApiError(422, "email: Enter the email address on your account so we can reply.", "validation");
  return ok(await fileAppeal({ userId: user?.id ?? null, contactEmail: user ? null : b.email, kind: b.kind, refId: b.refId, details: b.details }), 201);
});

export const GET = publicRoute(async () => {
  const user = await currentUser().catch(() => null);
  return ok({ kinds: APPEAL_KINDS, appeals: user ? await myAppeals(user.id) : [] });
});
