import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, ok, parseBody, route } from "@/lib/http";

/**
 * Put an account on legal hold: retention purges skip it (serious safety case, lawful request from an
 * authority, litigation). Every hold has a reason and is audited; release it when no longer needed.
 */
export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, z.object({
    userId: z.string().min(1).max(64), kind: z.enum(["SAFETY", "LAWFUL_REQUEST", "LITIGATION"]),
    reason: z.string().trim().min(10).max(500), reference: z.string().trim().max(120).optional(), days: z.number().int().min(1).max(3650).optional(),
  }));
  const target = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId), columns: { id: true } });
  if (!target) throw new ApiError(404, "User not found.", "not_found");
  const [h] = await db.insert(schema.legalHolds).values({
    userId: b.userId, kind: b.kind, reason: b.reason, reference: b.reference ?? null, createdById: user.id,
    until: b.days ? new Date(Date.now() + b.days * 86400_000) : null,
  }).returning();
  await audit(user.id, "legal_hold.create", "user", b.userId, { hold: h.id, kind: b.kind, reference: b.reference ?? null });
  return ok({ hold: h }, 201);
}, { permission: "reports.resolve" });
