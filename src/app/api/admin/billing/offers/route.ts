import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ok, parseBody, route } from "@/lib/http";
import { OfferBody, validateOffer } from "@/lib/admin-billing";

export const GET = route(async () => ok({ offers: await db.select().from(schema.offers).orderBy(desc(schema.offers.active), desc(schema.offers.priority)) }), { permission: "offers.edit" });

export const POST = route(async ({ req, user }) => {
  const b = await parseBody(req, OfferBody);
  await validateOffer(b);
  const [o] = await db.insert(schema.offers).values({ ...b, genders: b.genders.join(","), createdById: user.id }).returning();
  await audit(user.id, "offer.create", "offer", o.id, b);
  return ok({ offer: o }, 201);
}, { permission: "offers.edit" });
