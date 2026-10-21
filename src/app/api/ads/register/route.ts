import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AD_CATEGORIES } from "@/lib/ads";
import { createSession, hashPassword, passwordOk, PASSWORD_RULES } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ApiError, clientIp, ok, parseBody, publicRoute } from "@/lib/http";
import { issueOtp } from "@/lib/otp";
import { rateLimit } from "@/lib/ratelimit";
import { checkUrl } from "@/lib/ads";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
  businessName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/, "Enter a phone number"),
  category: z.enum(Object.keys(AD_CATEGORIES) as [string, ...string[]]),
  website: z.string().trim().max(300).optional(),
  address: z.string().trim().max(300).optional(),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, "GSTIN has 15 letters and digits").optional().or(z.literal("")),
  acceptTerms: z.literal(true, { message: "Accept the Advertising Terms and Policy to continue" }),
});

/** "Advertise with us": a business login (role ADVERTISER) that only reaches the advertiser pages. */
export const POST = publicRoute(async ({ req }) => {
  const ip = await clientIp();
  await rateLimit(`ad-register:${ip}`, 5, 60 * 60_000);
  const b = await parseBody(req, Body);
  if (!passwordOk(b.password)) throw new ApiError(422, `Password: ${PASSWORD_RULES}`, "weak_password");
  if (b.website && checkUrl(b.website)) throw new ApiError(422, `website: ${checkUrl(b.website)}`, "validation");
  if (await db.query.users.findFirst({ where: eq(schema.users.email, b.email) })) throw new ApiError(409, "An account with this email already exists. Log in instead.", "email_taken");
  const [user] = await db.insert(schema.users).values({ email: b.email, passwordHash: await hashPassword(b.password), role: "ADVERTISER", onboardingStep: 3, signupIp: ip }).returning();
  const [adv] = await db.insert(schema.advertisers).values({ userId: user.id, businessName: b.businessName, contactName: b.contactName, email: b.email, phone: b.phone, category: b.category, website: b.website || null, address: b.address || null, gstin: b.gstin || null }).returning();
  await audit(user.id, "ads.advertiser_register", "advertiser", adv.id, { category: b.category });
  const devOtp = await issueOtp(user.id, "EMAIL", user.email);
  await createSession(user);
  return ok({ advertiserId: adv.id, next: "/ads", devOtp }, 201);
});
