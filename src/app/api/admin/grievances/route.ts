import { listGrievances } from "@/lib/grievances";
import { ok, route } from "@/lib/http";

export const GET = route(async ({ req }) => {
  const status = new URL(req.url).searchParams.get("status") === "closed" ? "closed" : "open";
  return ok({ grievances: await listGrievances(status) });
}, { permission: "grievances.handle" });
