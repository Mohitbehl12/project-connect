import { z } from "zod";
import { count, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit, verifyAuditChain } from "@/lib/audit";
import { allCountryRules } from "@/lib/compliance";
import { getConfig, setConfig } from "@/lib/config";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { retentionSchedule } from "@/lib/privacy";
import { can } from "@/lib/rbac";
import { vendors } from "@/lib/vendors";

/** Privacy & compliance overview: country rules, service providers, retention, legal holds, audit chain, AI decisions. */
export const GET = route(async () => {
  const status = await getConfig("vendors.status");
  const holds = await db.select({ h: schema.legalHolds, email: schema.users.email }).from(schema.legalHolds)
    .innerJoin(schema.users, eq(schema.users.id, schema.legalHolds.userId)).where(isNull(schema.legalHolds.releasedAt)).orderBy(desc(schema.legalHolds.createdAt));
  const decisions = await db.select({ kind: schema.automatedDecisions.kind, n: count() }).from(schema.automatedDecisions).groupBy(schema.automatedDecisions.kind);
  const consents = await db.select({ kind: schema.consents.kind, granted: schema.consents.granted, n: count() }).from(schema.consents).groupBy(schema.consents.kind, schema.consents.granted);
  return ok({
    countries: await allCountryRules(),
    vendors: vendors().map((v) => ({ ...v, dpa: status[v.id]?.dpa ?? "NOT_STARTED", notes: status[v.id]?.notes ?? "" })),
    retention: await retentionSchedule(),
    holds: holds.map((x) => ({ ...x.h, email: x.email })),
    auditChain: await verifyAuditChain(),
    automatedDecisions: decisions,
    consentRecords: consents,
  });
}, { permission: "audit.view" });

const Rules = z.object({
  launchEnabled: z.boolean(), minAge: z.number().int().min(18).max(25), ageAssurance: z.enum(["SELF_DECLARED", "SELFIE_REQUIRED"]),
  privacyLaw: z.string().max(300), marketingConsent: z.literal("OPT_IN"), grievanceReplyDays: z.number().int().min(1).max(90),
  urgentTakedownHours: z.number().int().min(1).max(168), coolingOffDays: z.number().int().min(0).max(30), pricesIncludeTax: z.boolean(),
  dataTransferNote: z.string().max(500), personalisedAdsDefault: z.boolean(), legalReviewed: z.boolean(), reviewer: z.string().max(120), reviewedAt: z.string().max(40).nullable(),
}).partial();

const Body = z.object({
  countries: z.record(z.string().regex(/^([A-Z]{2}|\*)$/), Rules).optional(),
  vendors: z.record(z.string().max(40), z.object({ dpa: z.enum(["NOT_STARTED", "IN_PROGRESS", "SIGNED", "NOT_NEEDED"]), notes: z.string().max(500) })).optional(),
});

export const PUT = route(async ({ req, user }) => {
  if (!can(user.role, "config.edit")) throw new ApiError(403, "You don't have permission to change these settings.", "forbidden");
  const b = await parseBody(req, Body);
  if (b.countries) {
    const before = await getConfig("compliance.countries");
    const next = { ...before };
    for (const [k, v] of Object.entries(b.countries)) {
      // Marking a country "reviewed by a lawyer" records who said so and when.
      const stamp = v.legalReviewed && !before[k]?.legalReviewed ? { reviewedAt: new Date().toISOString() } : {};
      next[k] = { ...(before[k] ?? {}), ...v, ...stamp };
    }
    await setConfig("compliance.countries", next, user.id);
    await audit(user.id, "compliance.countries", "config", "compliance.countries", { changed: Object.keys(b.countries) });
  }
  if (b.vendors) {
    const before = await getConfig("vendors.status");
    await setConfig("vendors.status", { ...before, ...b.vendors }, user.id);
    await audit(user.id, "compliance.vendors", "config", "vendors.status", { changed: Object.keys(b.vendors) });
  }
  return ok({ saved: true });
}, { permission: "audit.view" });
