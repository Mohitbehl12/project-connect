import "server-only";
import { getConfig } from "./config";
import { COUNTRIES, MIN_AGE } from "./constants";

// Country rules live in configuration (Admin → Privacy & compliance), not in code, so a new country or a
// change in law is a settings change. The values below are STARTING POINTS for testing, not legal advice:
// a qualified lawyer must confirm them for each country before launch (legalReviewed).

export type CountryRules = {
  launchEnabled: boolean;
  minAge: number;
  ageAssurance: "SELF_DECLARED" | "SELFIE_REQUIRED"; // SELFIE_REQUIRED: must pass the selfie check before liking anyone
  privacyLaw: string;
  marketingConsent: "OPT_IN";
  grievanceReplyDays: number;
  urgentTakedownHours: number; // intimate images / impersonation
  coolingOffDays: number; // right to cancel a new subscription for a refund (0 = none required)
  pricesIncludeTax: boolean;
  dataTransferNote: string;
  legalReviewed: boolean;
  reviewer: string;
  reviewedAt: string | null;
};

const base: CountryRules = {
  launchEnabled: true, minAge: MIN_AGE, ageAssurance: "SELF_DECLARED", privacyLaw: "", marketingConsent: "OPT_IN",
  grievanceReplyDays: 30, urgentTakedownHours: 24, coolingOffDays: 0, pricesIncludeTax: true,
  dataTransferNote: "Data is processed where our hosting provider runs the service; see Service providers.", legalReviewed: false, reviewer: "", reviewedAt: null,
};

export const COMPLIANCE_DEFAULTS: Record<string, CountryRules> = {
  "*": { ...base, privacyLaw: "Local law (to be confirmed)" },
  IN: { ...base, privacyLaw: "Digital Personal Data Protection Act 2023; IT Act 2000 and IT Rules 2021", grievanceReplyDays: 15, urgentTakedownHours: 24 },
  GB: { ...base, privacyLaw: "UK GDPR and Data Protection Act 2018; Online Safety Act 2023", coolingOffDays: 14, grievanceReplyDays: 30 },
  US: { ...base, privacyLaw: "State privacy laws (e.g. CCPA/CPRA); FTC Act; state online-dating safety laws", pricesIncludeTax: false },
  CA: { ...base, privacyLaw: "PIPEDA and provincial laws", pricesIncludeTax: false },
  AU: { ...base, privacyLaw: "Privacy Act 1988; Online Safety Act 2021; Online Dating Industry Code" },
  AE: { ...base, privacyLaw: "PDPL (Federal Decree-Law 45/2021); local content rules — get advice before launching", launchEnabled: false },
  SG: { ...base, privacyLaw: "PDPA 2012" },
  JP: { ...base, privacyLaw: "APPI; Act on Regulation of Soliciting Children (age verification for dating services)", ageAssurance: "SELFIE_REQUIRED" },
};

export async function countryRules(country: string | null | undefined): Promise<CountryRules> {
  const all = await getConfig("compliance.countries");
  const c = country ?? "*";
  return { ...base, ...COMPLIANCE_DEFAULTS["*"], ...(all["*"] ?? {}), ...(COMPLIANCE_DEFAULTS[c] ?? {}), ...(all[c] ?? {}) };
}

export async function allCountryRules() {
  const all = await getConfig("compliance.countries");
  const merged: Record<string, CountryRules> = {};
  for (const k of ["*", ...Object.keys(COUNTRIES)]) merged[k] = { ...base, ...COMPLIANCE_DEFAULTS["*"], ...(COMPLIANCE_DEFAULTS[k] ?? {}), ...(all[k] ?? {}) };
  return merged;
}
