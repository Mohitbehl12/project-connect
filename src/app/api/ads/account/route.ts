import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { checkUrl, requireAdvertiser } from "@/lib/ads";
import { accountSummary } from "@/lib/adsManage";
import { ApiError, ok, parseBody, route } from "@/lib/http";

export const GET = route(async ({ user }) => ok(await accountSummary(await requireAdvertiser(user))), { allowOnboarding: true });

export const PUT = route(async ({ req, user }) => {
  const adv = await requireAdvertiser(user);
  const b = await parseBody(req, z.object({ contactName: z.string().trim().min(2).max(80), phone: z.string().trim().max(20), website: z.string().trim().max(300).optional(), address: z.string().trim().max(300).optional(), gstin: z.string().trim().max(15).optional() }));
  if (b.website && checkUrl(b.website)) throw new ApiError(422, `website: ${checkUrl(b.website)}`, "validation");
  await db.update(schema.advertisers).set({ contactName: b.contactName, phone: b.phone, website: b.website || null, address: b.address || null, gstin: b.gstin || null }).where(eq(schema.advertisers.id, adv.id));
  return ok({ saved: true });
}, { allowOnboarding: true });
