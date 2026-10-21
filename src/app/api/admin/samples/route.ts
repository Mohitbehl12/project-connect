import { z } from "zod";
import { count, inArray, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { storage } from "@/lib/storage";

const isSample = () => or(like(schema.users.email, "%@test.local"), like(schema.users.email, "%@demo.local"));

export const GET = route(async () => {
  const [{ n }] = await db.select({ n: count() }).from(schema.users).where(isSample());
  return ok({ count: n, envNote: process.env.SEED_SAMPLE_USERS === "true" ? "SEED_SAMPLE_USERS is still true — sample people come back on the next restart. Set it to false in Render." : null });
}, { permission: "audit.view" });

/**
 * Removes every fictional sample person (emails ending @test.local or @demo.local) with their photos,
 * matches and messages. Super admins only, and only after typing the confirmation phrase.
 */
export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, z.object({ confirm: z.string() }));
  if (b.confirm !== "REMOVE SAMPLE PEOPLE") throw new ApiError(422, "Type REMOVE SAMPLE PEOPLE to confirm.", "confirm");
  const rows = await db.select({ id: schema.users.id }).from(schema.users).where(isSample());
  const ids = rows.map((r) => r.id);
  let removed = 0, failed = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const files = await db.select({ key: schema.photos.storageKey }).from(schema.photos).where(inArray(schema.photos.userId, chunk));
    for (const f of files) await storage().delete(f.key).catch(() => {});
    try { removed += (await db.delete(schema.users).where(inArray(schema.users.id, chunk)).returning({ id: schema.users.id })).length; }
    catch { failed += chunk.length; }
  }
  await audit(user.id, "samples.remove", "user", null, { removed, failed });
  return ok({ removed, failed, envNote: process.env.SEED_SAMPLE_USERS === "true" ? "Also set SEED_SAMPLE_USERS to false in Render, or they come back on the next restart." : null });
}, { permission: "roles.assign" });
