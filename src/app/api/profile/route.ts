import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { CITIES, GENDERS, INTENTS, INTERESTS, LIFESTYLE } from "@/lib/constants";
import { profileCompleteness } from "@/lib/matching";
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

export const PUT = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  if (!user.dob) throw new ApiError(400, "Your date of birth is missing. Contact support.", "no_dob");

  // Block contact details and links in public profile text.
  const publicText = [b.bio, ...b.prompts.map((p) => p.a)].join("\n");
  const flags = screenMessage(publicText);
  if (flags.includes("CONTACT_INFO") || flags.includes("LINK") || flags.includes("OFF_PLATFORM"))
    throw new ApiError(422, "Keep phone numbers, emails, links and other apps out of your profile. You can share them in chat when you're ready.", "contact_in_profile");
  if (flags.includes("ABUSE")) throw new ApiError(422, "Your profile includes language that breaks our community guidelines.", "abusive_profile");

  const c = CITIES[b.city];
  const existing = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) });
  const answerCount = (await db.select().from(schema.personalityAnswers).where(eq(schema.personalityAnswers.userId, user.id))).length;
  let photos: string[] = [];
  try { photos = existing ? JSON.parse(existing.photos) : []; } catch { /* ignore */ }

  // Store the city centre with a stable per-user jitter (~±3 km). Device GPS is never collected.
  const cityChanged = !existing || existing.city !== b.city;
  const seed = [...user.id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 10007, 7);
  const lat = cityChanged ? c.lat + ((seed % 100) / 100 - 0.5) * 0.06 : existing!.lat;
  const lng = cityChanged ? c.lng + ((Math.floor(seed / 100) % 100) / 100 - 0.5) * 0.06 : existing!.lng;

  const values = {
    firstName: b.firstName, dob: user.dob, gender: b.gender, bio: b.bio, country: c.country, city: b.city, lat, lng,
    education: b.education ?? null, profession: b.profession ?? null, industry: b.industry ?? null, heightCm: b.heightCm ?? null,
    drinking: b.drinking ?? null, smoking: b.smoking ?? null, food: b.food ?? null, exercise: b.exercise ?? null, pets: b.pets ?? null,
    intent: b.intent, interests: b.interests.join(","), prompts: JSON.stringify(b.prompts),
    completeness: profileCompleteness({ ...b, photos, answerCount }), updatedAt: new Date(),
  };
  await db.insert(schema.profiles).values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: schema.profiles.userId, set: values });
  if (user.onboardingStep < 1) await db.update(schema.users).set({ onboardingStep: 1 }).where(eq(schema.users.id, user.id));
  return ok({ saved: true, completeness: values.completeness });
});
