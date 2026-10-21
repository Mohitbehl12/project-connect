import { db, schema } from "@/db";
import { viewerHash } from "@/lib/ads";
import { ok, route } from "@/lib/http";

/** "Hide this ad": you won't see it again. The advertiser only sees a total hide count. */
export const POST = route<{ id: string }>(async ({ user, params }) => {
  const c = await db.query.adCampaigns.findFirst({ where: (t, { eq }) => eq(t.id, params.id) });
  if (!c) return ok({ hidden: false });
  await db.insert(schema.adHidden).values({ userId: user.id, campaignId: c.id }).onConflictDoNothing();
  await db.insert(schema.adEvents).values({ campaignId: c.id, kind: "HIDE", viewer: viewerHash(user.id), day: new Date().toISOString().slice(0, 10) });
  return ok({ hidden: true });
});
