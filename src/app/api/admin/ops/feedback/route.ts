import { feedbackSummary } from "@/lib/feedback";
import { ok, route } from "@/lib/http";

export const GET = route(async ({ req }) => {
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  return ok(await feedbackSummary(days));
}, { permission: "ops.view" });
