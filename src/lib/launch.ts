import "server-only";
import { and, count, eq, isNull, like, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyAuditChain } from "./audit";
import { allCountryRules } from "./compliance";
import { getConfig } from "./config";
import { vendors } from "./vendors";

// Launch readiness (spec §28–§30). Automatic checks read the live configuration; the sign-off items are
// things only people can confirm (a lawyer's review, a penetration test). Nothing here claims the service
// is "compliant" or "secure" — it tracks whether the checks have been done and by whom.

export const SIGNOFF_ITEMS: { id: string; group: string; label: string }[] = [
  ...[
    "Terms of Service", "Privacy Policy", "Cookie Policy", "Community Guidelines", "Subscription Terms", "Refund Policy",
    "Data retention policy", "Consent wording and flows", "Age and eligibility controls", "User reporting process", "Call consent flow",
    "Data processing agreements", "Third-party vendor contracts", "Payment flow (incl. gender-based pricing)", "Applicable local laws for each launch country",
  ].map((label, i) => ({ id: `legal.${i + 1}`, group: "Legal review (qualified lawyer)", label })),
  ...[
    "Vulnerability assessment", "Penetration test by an independent firm", "Authentication", "Authorisation (every API, every role)", "API security",
    "File uploads", "Payment security", "Privacy controls", "Account deletion", "Blocked-user bypass attempts", "Call-request bypass attempts",
    "Rate limits", "Abuse reporting", "Admin permissions", "Data leakage", "Location leakage",
  ].map((label, i) => ({ id: `sec.${i + 1}`, group: "Security testing before launch", label })),
  ...[
    "Security check", "Privacy check", "Safety check", "Legal review", "Abuse and edge-case testing",
  ].map((label, i) => ({ id: `gate.${i + 1}`, group: "Release gate for each major feature (sign off the current release)", label })),
];

type Check = { id: string; label: string; ok: boolean; detail: string };

export async function autoChecks(): Promise<Check[]> {
  const env = (k: string) => process.env[k];
  const c = await getConfig("legal.contacts");
  const samples = (await db.select({ n: count() }).from(schema.users).where(or(like(schema.users.email, "%@test.local"), like(schema.users.email, "%@demo.local"))))[0]?.n ?? 0;
  const staffNoMfa = (await db.select({ n: count() }).from(schema.users).where(and(ne(schema.users.role, "USER"), isNull(schema.users.totpSecret), ne(schema.users.status, "DELETED"))))[0]?.n ?? 0;
  const published = await db.select({ slug: schema.legalDocuments.slug, reviewed: schema.legalVersions.lawyerReviewedAt }).from(schema.legalVersions)
    .innerJoin(schema.legalDocuments, eq(schema.legalDocuments.id, schema.legalVersions.documentId)).where(eq(schema.legalVersions.status, "PUBLISHED"));
  const unreviewed = published.filter((p) => !p.reviewed).map((p) => p.slug);
  const countries = Object.entries(await allCountryRules()).filter(([k, r]) => k !== "*" && r.launchEnabled);
  const notReviewed = countries.filter(([, r]) => !r.legalReviewed).map(([k]) => k);
  const dpa = await getConfig("vendors.status");
  const noDpa = vendors().filter((v) => v.active && !["SIGNED", "NOT_NEEDED"].includes(dpa[v.id]?.dpa ?? "")).map((v) => v.name);
  const backup = await getConfig("ops.lastBackup");
  const backupFresh = !!backup.at && Date.now() - new Date(backup.at).getTime() < 2 * 86400_000;
  const chain = await verifyAuditChain();
  const shot = await getConfig("moderation.photoScreening");
  return [
    { id: "otp", label: "Real sign-up codes (no test codes shown)", ok: env("DEV_SHOW_OTP") !== "true", detail: env("DEV_SHOW_OTP") === "true" ? "DEV_SHOW_OTP=true shows codes on screen" : "OK" },
    { id: "sms", label: "Email or SMS provider for codes", ok: !!(env("RESEND_API_KEY") || env("MSG91_AUTH_KEY")), detail: env("RESEND_API_KEY") || env("MSG91_AUTH_KEY") ? "Configured" : "Neither RESEND_API_KEY nor MSG91_AUTH_KEY is set" },
    { id: "mockpay", label: "Test payments switched off", ok: env("ENABLE_MOCK_PAYMENTS") !== "true", detail: env("ENABLE_MOCK_PAYMENTS") === "true" ? "ENABLE_MOCK_PAYMENTS=true" : "OK" },
    { id: "razorpay", label: "Real payment provider configured", ok: !!(env("RAZORPAY_KEY_ID") && env("RAZORPAY_WEBHOOK_SECRET")), detail: env("RAZORPAY_KEY_ID") ? "Razorpay keys set" : "Razorpay keys not set" },
    { id: "staffmfa", label: "2-step verification required for staff", ok: env("ADMIN_MFA_OPTIONAL") !== "true" && staffNoMfa === 0, detail: env("ADMIN_MFA_OPTIONAL") === "true" ? "ADMIN_MFA_OPTIONAL=true (test setting)" : staffNoMfa ? `${staffNoMfa} staff account(s) haven't turned it on yet` : "All staff use it" },
    { id: "samples", label: "Sample (fictional) people removed", ok: samples === 0, detail: samples ? `${samples} sample accounts — run npm run db:remove-samples and set SEED_SAMPLE_USERS=false` : "None" },
    { id: "legaldocs", label: "Published legal documents reviewed by a lawyer", ok: !unreviewed.length && published.length > 0, detail: unreviewed.length ? `Not reviewed: ${unreviewed.join(", ")}` : "All recorded as reviewed" },
    { id: "contacts", label: "Company name, address and Grievance Officer published", ok: !!(c.companyName && c.grievanceOfficer.name && c.grievanceOfficer.email && (c.registeredAddress || c.grievanceOfficer.address)), detail: "Admin → Settings → Contacts" },
    { id: "countries", label: "Country rules reviewed for every launch country", ok: !notReviewed.length, detail: notReviewed.length ? `Not reviewed: ${notReviewed.join(", ")}` : "OK" },
    { id: "dpa", label: "Data processing agreements with active providers", ok: !noDpa.length, detail: noDpa.length ? `Missing: ${noDpa.join(", ")}` : "OK" },
    { id: "photos", label: "Automatic photo screening on", ok: shot !== "off", detail: `Mode: ${shot}` },
    { id: "turn", label: "Call relay (TURN) configured", ok: !!(env("CLOUDFLARE_TURN_KEY_ID") || env("TURN_URLS")), detail: env("CLOUDFLARE_TURN_KEY_ID") || env("TURN_URLS") ? "Configured" : "Calls can't connect without it" },
    { id: "cron", label: "Scheduled jobs (retention, renewals) running", ok: !!env("CRON_SECRET"), detail: env("CRON_SECRET") ? "CRON_SECRET set" : "CRON_SECRET not set — retention purges won't run" },
    { id: "backup", label: "Recent database backup", ok: backupFresh, detail: backup.at ? `Last: ${backup.at}` : "No backup recorded" },
    { id: "audit", label: "Audit log chain intact", ok: chain.ok, detail: chain.ok ? `${chain.checked} entries verified` : `Broken at entry ${"brokenAt" in chain ? chain.brokenAt : "?"}` },
  ];
}
