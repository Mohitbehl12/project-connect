import { z } from "zod";
import { ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import * as D from "@/lib/style/darzi.js";
import { listProfiles } from "@/lib/style/server";

// "AI design": turns a description ("slim white linen shirt, mandarin collar, hidden buttons") into a design,
// and suggests outfits for an occasion using the person's measurements. Rule-based and explainable — it shows
// exactly what it understood; nothing is sent to an outside AI service.
const Body = z.object({ prompt: z.string().trim().max(500).optional(), base: z.record(z.string(), z.unknown()).optional(), occasion: z.enum(["Office", "Wedding", "Casual", "Festive"]).optional() });

export const POST = route(async ({ req, user }) => {
  await rateLimit(`style-ai:${user.id}`, 60, 60 * 60_000);
  const b = await parseBody(req, Body);
  if (b.occasion) {
    const p = (await listProfiles(user.id)).find((x) => x.rel === "Self" && x.m) ?? null;
    return ok({ suggestions: D.recommend(b.occasion, p).map((r) => ({ ...r, price: D.price(r.spec), description: D.describe(r.spec) })) });
  }
  const { ch, u } = D.parsePrompt(b.prompt ?? "");
  const base = (b.base && typeof b.base.category === "string" && D.CATS[b.base.category] ? b.base : D.defaultSpec((ch.category as string) ?? "shirt")) as D.Spec;
  const spec = D.normalize({ ...(ch.category && ch.category !== base.category ? D.defaultSpec(ch.category) : base), ...ch } as D.Spec);
  return ok({ spec, understood: u, price: D.price(spec), description: D.describe(spec), nothingUnderstood: u.length === 0 });
});
