import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, ok, route } from "@/lib/http";

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const [h] = await db.update(schema.legalHolds).set({ releasedAt: new Date() }).where(and(eq(schema.legalHolds.id, params.id), isNull(schema.legalHolds.releasedAt))).returning();
  if (!h) throw new ApiError(404, "Hold not found or already released.", "not_found");
  await audit(user.id, "legal_hold.release", "user", h.userId, { hold: h.id });
  return ok({ released: true });
}, { permission: "reports.resolve" });
