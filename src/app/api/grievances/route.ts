import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { fileGrievance, GRIEVANCE_CATEGORIES, type GrievanceCategory } from "@/lib/grievances";
import { clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(120),
  category: z.enum(Object.keys(GRIEVANCE_CATEGORIES) as [GrievanceCategory, ...GrievanceCategory[]]),
  details: z.string().trim().min(20, "Please describe the problem in a few sentences.").max(4000),
});

/** A formal complaint to the Grievance Officer. Open to anyone, signed in or not (rate-limited). */
export const POST = publicRoute(async ({ req }) => {
  await rateLimit(`grievance:${await clientIp()}`, 5, 60 * 60_000);
  const b = await parseBody(req, Body);
  const user = await currentUser().catch(() => null);
  return ok(await fileGrievance({ ...b, userId: user?.id ?? null }), 201);
});

export const GET = publicRoute(async () => ok({ categories: GRIEVANCE_CATEGORIES }));
