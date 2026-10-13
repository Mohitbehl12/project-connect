import { z } from "zod";
import { cancelSubscription, changePlan, paymentHistory, resumeSubscription, subscriptionSummary } from "@/lib/billing";
import { ok, parseBody, route } from "@/lib/http";

export const GET = route(async ({ user }) => ok({ subscription: await subscriptionSummary(user.id), payments: await paymentHistory(user.id) }));

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("change"), planCode: z.string().min(1).max(30) }),
]);

export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, Body);
  if (b.action === "cancel") return ok(await cancelSubscription(user));
  if (b.action === "resume") return ok({ subscription: await resumeSubscription(user) });
  return ok({ subscription: await changePlan(user, b.planCode) });
});
