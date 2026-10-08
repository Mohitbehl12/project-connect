import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { PERSONALITY_QUESTIONS } from "@/lib/constants";
import { profileCompleteness } from "@/lib/matching";

const keys = new Set<string>(PERSONALITY_QUESTIONS.map((q) => q.key));
const Body = z.object({ answers: z.record(z.string(), z.number().int().min(1).max(5)) });

export const PUT = route(async ({ req, user }) => {
  const { answers } = await parseBody(req, Body);
  const entries = Object.entries(answers).filter(([k]) => keys.has(k));
  if (entries.length < 6) throw new ApiError(422, "Answer at least 6 questions so we can find good matches.", "too_few_answers");

  for (const [questionKey, value] of entries)
    await db.insert(schema.personalityAnswers).values({ userId: user.id, questionKey, value })
      .onConflictDoUpdate({ target: [schema.personalityAnswers.userId, schema.personalityAnswers.questionKey], set: { value } });

  const p = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) });
  if (p) {
    const all = await db.select().from(schema.personalityAnswers).where(eq(schema.personalityAnswers.userId, user.id));
    const completeness = profileCompleteness({
      ...p, interests: p.interests.split(",").filter(Boolean), photos: JSON.parse(p.photos), prompts: JSON.parse(p.prompts), answerCount: all.length,
    });
    await db.update(schema.profiles).set({ completeness }).where(eq(schema.profiles.userId, user.id));
  }
  if (user.onboardingStep === 2) await db.update(schema.users).set({ onboardingStep: 3 }).where(eq(schema.users.id, user.id));
  return ok({ saved: entries.length });
});
