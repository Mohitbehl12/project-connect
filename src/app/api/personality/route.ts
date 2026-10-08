import { syncOnboardingStep } from "@/lib/photos";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { PERSONALITY_QUESTIONS } from "@/lib/constants";
import { refreshCompleteness } from "@/lib/photos";

const keys = new Set<string>(PERSONALITY_QUESTIONS.map((q) => q.key));
const Body = z.object({ answers: z.record(z.string(), z.number().int().min(1).max(5)) });

export const PUT = route(async ({ req, user }) => {
  const { answers } = await parseBody(req, Body);
  const entries = Object.entries(answers).filter(([k]) => keys.has(k));
  if (entries.length < 6) throw new ApiError(422, "Answer at least 6 questions so we can find good matches.", "too_few_answers");

  for (const [questionKey, value] of entries)
    await db.insert(schema.personalityAnswers).values({ userId: user.id, questionKey, value })
      .onConflictDoUpdate({ target: [schema.personalityAnswers.userId, schema.personalityAnswers.questionKey], set: { value } });

  await refreshCompleteness(user.id);
  const onboardingStep = await syncOnboardingStep(user.id);
  return ok({ saved: entries.length, onboardingStep });
});
