import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { OfferBody, validateOffer } from "@/lib/admin-billing";

export const PUT = route<{ id: string }>(async ({ req, user, params }) => {
  const b = await parseBody(req, OfferBody);
  await validateOffer(b);
  const before = await db.query.offers.findFirst({ where: eq(schema.offers.id, params.id) });
  if (!before) throw new ApiError(404, "Offer not found.", "not_found");
  await db.update(schema.offers).set({ ...b, genders: b.genders.join(",") }).where(eq(schema.offers.id, params.id));
  await audit(user.id, "offer.update", "offer", params.id, { before, after: b });
  return ok({ saved: true });
}, { permission: "offers.edit" });
