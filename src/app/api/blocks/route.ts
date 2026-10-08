import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { orderedPair } from "@/lib/matches";
import { audit } from "@/lib/audit";

const Body = z.object({ userId: z.string().min(1).max(64) });

export const POST = route(async ({ req, user }) => {
  const { userId } = await parseBody(req, Body);
  if (userId === user.id) throw new ApiError(400, "You can't block yourself.", "self");
  await db.insert(schema.blocks).values({ blockerId: user.id, blockedId: userId }).onConflictDoNothing();
  const [a, b] = orderedPair(user.id, userId);
  await db.update(schema.matches).set({ status: "UNMATCHED", unmatchedBy: user.id })
    .where(and(eq(schema.matches.userAId, a), eq(schema.matches.userBId, b)));
  await audit(user.id, "user.block", "user", userId);
  return ok({ blocked: true }, 201);
}, { allowSuspended: true });

export const GET = route(async ({ user }) => {
  const rows = await db.select({ id: schema.blocks.blockedId, at: schema.blocks.createdAt, name: schema.profiles.firstName })
    .from(schema.blocks).leftJoin(schema.profiles, eq(schema.profiles.userId, schema.blocks.blockedId))
    .where(eq(schema.blocks.blockerId, user.id));
  return ok({ blocked: rows.map((r) => ({ id: r.id, firstName: r.name ?? "Deleted account", blockedAt: r.at })) });
}, { allowSuspended: true });

/** Unblock. The previous match is not restored; both people can find each other again in discovery. */
export const DELETE = route(async ({ req, user }) => {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) throw new ApiError(422, "userId is required.", "validation");
  await db.delete(schema.blocks).where(and(eq(schema.blocks.blockerId, user.id), eq(schema.blocks.blockedId, userId)));
  // Clear any earlier like/pass so they can reappear in discovery.
  await db.delete(schema.likes).where(and(eq(schema.likes.fromId, user.id), eq(schema.likes.toId, userId)));
  await audit(user.id, "user.unblock", "user", userId);
  return ok({ unblocked: true });
}, { allowSuspended: true });
