import { syncOnboardingStep } from "@/lib/photos";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { GENDERS, INTENTS } from "@/lib/constants";
import { planFeatures } from "@/lib/config";

const g = Object.keys(GENDERS) as [string, ...string[]];
const i = Object.keys(INTENTS) as [string, ...string[]];

// Every field optional so the Settings screen can patch individual privacy/notification toggles.
const Body = z.object({
  interestedIn: z.array(z.enum(g)).min(1).optional(),
  ageMin: z.number().int().min(18).max(99).optional(),
  ageMax: z.number().int().min(18).max(99).optional(),
  maxDistanceKm: z.number().int().min(2).max(500).optional(),
  intents: z.array(z.enum(i)).optional(),
  longDistance: z.boolean().optional(),
  discoverable: z.boolean().optional(),
  showOnline: z.boolean().optional(),
  readReceipts: z.boolean().optional(),
  incognito: z.boolean().optional(),
  notifyMatches: z.boolean().optional(),
  notifyMessages: z.boolean().optional(),
  notifyLikes: z.boolean().optional(),
  callRequests: z.enum(["MATCHES", "NOBODY"]).optional(),
  notifyEmail: z.boolean().optional(),
  theme: z.enum(["SYSTEM", "LIGHT", "DARK"]).optional(),
  showDistance: z.boolean().optional(),
  likesFrom: z.enum(["EVERYONE", "VERIFIED"]).optional(),
});

export const PUT = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  const current = await db.query.preferences.findFirst({ where: eq(schema.preferences.userId, user.id) });
  if (!current && !b.interestedIn) throw new ApiError(422, "interestedIn: Choose who you'd like to meet.", "validation");

  const ageMin = b.ageMin ?? current?.ageMin ?? 21;
  const ageMax = b.ageMax ?? current?.ageMax ?? 35;
  if (ageMin > ageMax) throw new ApiError(422, "ageMin: Minimum age can't be higher than maximum age.", "validation");
  if (b.incognito) {
    const f = await planFeatures(user.planCode, user.planEndsAt);
    if (!f.incognito) throw new ApiError(402, "Incognito mode is part of Premium Plus.", "upgrade_required");
  }

  const { interestedIn, intents, ...rest } = b;
  const values = {
    ...rest, ageMin, ageMax,
    ...(interestedIn ? { interestedIn: interestedIn.join(",") } : {}),
    ...(intents ? { intents: intents.join(",") } : {}),
  };
  await db.insert(schema.preferences).values({ userId: user.id, interestedIn: interestedIn?.join(",") ?? "", ...values })
    .onConflictDoUpdate({ target: schema.preferences.userId, set: values });
  const onboardingStep = await syncOnboardingStep(user.id);
  return ok({ saved: true, onboardingStep });
});
