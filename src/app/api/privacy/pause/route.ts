import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ok, parseBody, route } from "@/lib/http";
import { recordConsent } from "@/lib/consent";

/**
 * Pause (deactivate) my profile: hidden from Discover and Likes, nobody can like me, message me or ask to
 * call, and my data stays as it is. Turning it back on restores everything. Different from deleting.
 */
export const POST = route(async ({ req, user }) => {
  const { paused } = await parseBody(req, z.object({ paused: z.boolean() }));
  await db.update(schema.users).set({ deactivatedAt: paused ? new Date() : null }).where(eq(schema.users.id, user.id));
  await recordConsent(user.id, "PROFILE_VISIBLE", !paused);
  await audit(user.id, paused ? "privacy.pause" : "privacy.unpause", "user", user.id);
  return ok({ paused });
}, { allowOnboarding: true });
