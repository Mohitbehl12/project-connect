import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ok, parseBody, route } from "@/lib/http";
import { recomputeRisk } from "@/lib/risk";
import { liftRestriction } from "@/lib/safety";
import { notify } from "@/lib/notify";

/** A reviewer clears a person's open signals after checking them (e.g. a shared family phone). */
export const POST = route<{ userId: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, z.object({ note: z.string().trim().min(3).max(300) }));
  await db.update(schema.riskSignals).set({ resolvedAt: new Date(), resolvedById: user.id })
    .where(and(eq(schema.riskSignals.userId, params.userId), isNull(schema.riskSignals.resolvedAt)));
  const level = await recomputeRisk(params.userId);
  if (level !== "HIGH" && (await liftRestriction(params.userId, user.id, "risk reviewed")))
    await notify(params.userId, "MODERATION", "All features are back", "Our team reviewed your account. Likes, call requests and new conversations work again.");
  await audit(user.id, "risk.resolve", "user", params.userId, { note: b.note });
  return ok({ level });
}, { permission: "risk.resolve" });
