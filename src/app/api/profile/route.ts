import { syncOnboardingStep } from "@/lib/photos";
import { z } from "zod";
import { addRiskSignal } from "@/lib/risk";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { CITIES, GENDERS, INTENTS, INTERESTS, LIFESTYLE } from "@/lib/constants";
import { refreshCompleteness } from "@/lib/photos";
import type { User } from "@/db/schema";
import { screenMessage } from "@/lib/moderation";

const keysOf = <T extends object>(o: T) => Object.keys(o) as [string, ...string[]];
const opt = <T extends object>(o: T) => z.enum(keysOf(o)).nullable().optional();

const Body = z.object({
  firstName: z.string().trim().min(1).max(40).regex(/^[\p{L}][\p{L}' .-]*$/u, "Use letters only"),
  gender: z.enum(keysOf(GENDERS)),
  city: z.enum(keysOf(CITIES)),
  bio: z.string().trim().max(500).default(""),
  intent: z.enum(keysOf(INTENTS)),
  education: z.string().trim().max(80).nullable().optional(),
  profession: z.string().trim().max(80).nullable().optional(),
  industry: z.string().trim().max(80).nullable().optional(),
  heightCm: z.number().int().min(120).max(230).nullable().optional(),
  drinking: opt(LIFESTYLE.drinking),
  smoking: opt(LIFESTYLE.smoking),
  food: opt(LIFESTYLE.food),
  exercise: opt(LIFESTYLE.exercise),
  pets: opt(LIFESTYLE.pets),
  interests: z.array(z.enum(keysOf(INTERESTS))).max(10).default([]),
  prompts: z.array(z.object({ q: z.string().trim().min(1).max(80), a: z.string().trim().min(1).max(200) })).max(3).default([]),
});

type ProfileInput = z.infer<typeof Body>;

async function saveProfile(user: User, b: ProfileInput) {
  if (!user.dob) throw new ApiError(400, "Your date of birth is missing. Contact support.", "no_dob");

  // Block contact details and links in public profile text.
  const publicText = [b.bio, ...b.prompts.map((p) => p.a)].join("\n");
  const flags = screenMessage(publicText);
  if (flags.includes("CONTACT_INFO") || flags.includes("LINK") || flags.includes("OFF_PLATFORM"))
    throw new ApiError(422, "Keep phone numbers, emails, links and other apps out of your profile. You can share them in chat when you're ready.", "contact_in_profile");
  if (flags.includes("ABUSE")) throw new ApiError(422, "Your profile includes language that breaks our community guidelines.", "abusive_profile");

  const c = CITIES[b.city];
  const existing = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) });
  // People may update their gender at any time. Because prices differ by gender in some countries, a change
  // after sign-up is noted for the risk review — it never blocks the change or the person.
  if (existing?.gender && existing.gender !== b.gender && user.onboardingStep >= 3)
    await addRiskSignal(user.id, "GENDER_CHANGED", 35, `${existing.gender} → ${b.gender}`).catch(() => {});

  // Store the city centre with a stable per-user jitter (~±3 km). Device GPS is never collected.
  const cityChanged = !existing || existing.city !== b.city;
  const seed = [...user.id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 10007, 7);
  const lat = cityChanged ? c.lat + ((seed % 100) / 100 - 0.5) * 0.06 : existing!.lat;
  const lng = cityChanged ? c.lng + ((Math.floor(seed / 100) % 100) / 100 - 0.5) * 0.06 : existing!.lng;

  const values = {
    firstName: b.firstName, dob: user.dob, gender: b.gender, bio: b.bio, country: c.country, city: b.city, lat, lng,
    education: b.education ?? null, profession: b.profession ?? null, industry: b.industry ?? null, heightCm: b.heightCm ?? null,
    drinking: b.drinking ?? null, smoking: b.smoking ?? null, food: b.food ?? null, exercise: b.exercise ?? null, pets: b.pets ?? null,
    intent: b.intent, interests: b.interests.join(","), prompts: JSON.stringify(b.prompts), updatedAt: new Date(),
  };
  await db.insert(schema.profiles).values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: schema.profiles.userId, set: values });
  const onboardingStep = await syncOnboardingStep(user.id);
  void onboardingStep;
  return refreshCompleteness(user.id);
}

/** Full save (web profile form). */
export const PUT = route(async ({ req, user }) => {
  const completeness = await saveProfile(user, await parseBody(req, Body));
  return ok({ saved: true, completeness });
});

/**
 * Partial save (app onboarding, one step at a time). The first call must include the basics
 * (firstName, gender, city, intent); later calls send only the fields that changed.
 */
export const PATCH = route(async ({ req, user }) => {
  const partial = await parseBody(req, Body.partial());
  const existing = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) });
  let prompts: { q: string; a: string }[] = [];
  try { prompts = existing ? JSON.parse(existing.prompts) : []; } catch { /* ignore */ }
  const merged = Body.parse({
    firstName: existing?.firstName, gender: existing?.gender, city: existing?.city, intent: existing?.intent,
    bio: existing?.bio ?? "", education: existing?.education, profession: existing?.profession, industry: existing?.industry,
    heightCm: existing?.heightCm, drinking: existing?.drinking, smoking: existing?.smoking, food: existing?.food,
    exercise: existing?.exercise, pets: existing?.pets,
    interests: existing?.interests ? existing.interests.split(",").filter(Boolean) : [], prompts,
    ...Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== undefined)),
  });
  const completeness = await saveProfile(user, merged);
  return ok({ saved: true, completeness });
});
