import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, hashPassword, issueTokens, passwordOk, PASSWORD_RULES } from "@/lib/auth";
import { ApiError, clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { ageFromDob } from "@/lib/matching";
import { MIN_AGE } from "@/lib/constants";
import { recordAcceptances, requiredLegalVersions } from "@/lib/legal";
import { issueOtp } from "@/lib/otp";
import { audit } from "@/lib/audit";
import { attachReferral } from "@/lib/referrals";
import { signupRiskChecks } from "@/lib/fraud";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD"),
  acceptLegal: z.literal(true, { message: "You need to accept the terms to create an account" }),
  confirmAdult: z.literal(true, { message: "You must confirm you are 18 or older" }),
  safetyAcknowledged: z.literal(true, { message: "Please acknowledge the safety guidelines" }),
  client: z.enum(["web", "app"]).default("web"), // "app" → tokens in the body instead of a cookie
  platform: z.enum(["ios", "android", "web"]).optional(),
  referralCode: z.string().trim().max(20).optional(),
});

export const POST = publicRoute(async ({ req }) => {
  const ip = await clientIp();
  await rateLimit(`register:${ip}`, 10, 60 * 60_000);
  const body = await parseBody(req, Body);

  if (!passwordOk(body.password)) throw new ApiError(422, `Password: ${PASSWORD_RULES}`, "weak_password");
  const dobDate = new Date(body.dob + "T00:00:00Z");
  if (isNaN(dobDate.getTime()) || dobDate > new Date()) throw new ApiError(422, "dob: Enter a real date of birth.", "validation");
  const age = ageFromDob(body.dob);
  if (age < MIN_AGE) throw new ApiError(403, "Kinara is only for people aged 18 and over.", "underage");
  if (age > 100) throw new ApiError(422, "dob: Check your date of birth.", "validation");

  const exists = await db.query.users.findFirst({ where: eq(schema.users.email, body.email) });
  // Same message either way would be ideal against enumeration, but signup UX needs a clear path to log in.
  if (exists) throw new ApiError(409, "An account with this email already exists. Log in instead.", "email_taken");

  const installId = req.headers.get("x-install-id")?.slice(0, 64) ?? null;
  const [user] = await db.insert(schema.users).values({
    email: body.email, passwordHash: await hashPassword(body.password), dob: body.dob, signupIp: ip, signupInstallId: installId,
  }).returning();
  await attachReferral(user, body.referralCode);
  await signupRiskChecks(user.id, ip, installId);

  const legal = await requiredLegalVersions();
  await recordAcceptances(user.id, legal.map((l) => l.versionId), ip);
  await audit(user.id, "user.register", "user", user.id, { legal: legal.map((l) => `${l.slug}@v${l.version}`) });

  const devCode = await issueOtp(user.id, "EMAIL", user.email);
  if (body.client === "app") {
    const tokens = await issueTokens(user, { platform: body.platform, ip, installId: installId ?? undefined });
    return ok({ id: user.id, next: "/onboarding", devOtp: devCode, ...tokens }, 201);
  }
  await createSession(user);
  return ok({ id: user.id, next: "/onboarding", devOtp: devCode }, 201);
});
