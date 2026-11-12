import { z } from "zod";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { openSafe } from "@/lib/crypto";
import { bios, dateIdeas, openers, replies } from "@/lib/cupid";
import { ok, parseBody, route } from "@/lib/http";
import { requireMatch } from "@/lib/matches";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({ task: z.enum(["opener", "reply", "date", "bio"]), matchId: z.string().max(64).optional(), seed: z.number().int().min(0).max(1000).default(0) });

async function person(userId: string) {
  const p = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, userId) });
  // A member who shows only their country must not have their city revealed through a suggestion.
  const prefs = await db.query.preferences.findFirst({ where: eq(schema.preferences.userId, userId), columns: { showCity: true } });
  let prompts: { q: string; a: string }[] = [];
  try { prompts = JSON.parse(p?.prompts ?? "[]"); } catch { /* ignore */ }
  return { firstName: p?.firstName ?? "", interests: (p?.interests ?? "").split(",").filter(Boolean), city: prefs?.showCity === false ? "" : p?.city ?? "", prompts, drinking: p?.drinking, intent: p?.intent };
}

/** Cupid ❤️: suggestions only (rule-based, from public profile details). Nothing is ever sent for you. */
export const POST = route(async ({ req, user }) => {
  await rateLimit(`cupid:${user.id}`, 60, 60 * 60_000);
  const b = await parseBody(req, Body);
  const me = await person(user.id);
  const note = "Cupid's ideas are automatic suggestions from your profiles — tap one to edit it before sending.";
  if (b.task === "bio") return ok({ ideas: bios(me, b.seed), note });
  const { match, otherId } = await requireMatch(b.matchId ?? "", user.id);
  const them = await person(otherId);
  if (b.task === "opener") return ok({ ideas: openers(me, them, b.seed), note });
  if (b.task === "date") return ok({ ideas: dateIdeas(me, them, b.seed), note });
  const last = await db.query.messages.findFirst({
    where: and(eq(schema.messages.matchId, match.id), ne(schema.messages.senderId, user.id), eq(schema.messages.kind, "TEXT")),
    orderBy: desc(schema.messages.createdAt),
  });
  return ok({ ideas: replies(last && !last.deletedAt ? openSafe(last.body, match.id) : null, them, b.seed), note });
});
