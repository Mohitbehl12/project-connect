import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, schema } from "@/db";
import { ok, route } from "@/lib/http";

export const GET = route(async () => {
  const referee = alias(schema.users, "referee");
  const rows = await db.select({ r: schema.referrals, referrer: schema.users.email, referee: referee.email, refereeRisk: referee.riskLevel })
    .from(schema.referrals).innerJoin(schema.users, eq(schema.users.id, schema.referrals.referrerId)).innerJoin(referee, eq(referee.id, schema.referrals.refereeId))
    .orderBy(desc(schema.referrals.createdAt)).limit(200);
  return ok({ referrals: rows.map(({ r, referrer, referee, refereeRisk }) => ({ ...r, referrer, referee, refereeRisk })) });
}, { permission: "referrals.manage" });
