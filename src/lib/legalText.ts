import "server-only";
import { getConfig } from "./config";
import { countryRules } from "./compliance";
import { retentionSchedule } from "./privacy";
import { vendors } from "./vendors";

const missing = (what: string) => `[${what} — to be added]`;

/** Fills {{placeholders}} in legal documents with live settings, so the text always matches how Kinara is configured. */
export async function fillLegal(body: string) {
  if (!body.includes("{{")) return body;
  const c = await getConfig("legal.contacts");
  const go = c.grievanceOfficer;
  const rules = await countryRules("IN");
  const active = vendors().filter((v) => v.active);
  const values: Record<string, () => Promise<string> | string> = {
    company: () => c.companyName || missing("company legal name"),
    address: () => c.registeredAddress || go.address || missing("registered address"),
    supportEmail: () => c.supportEmail || missing("support email"),
    safetyEmail: () => c.safetyEmail || c.supportEmail || missing("safety email"),
    privacyEmail: () => c.privacyEmail || c.supportEmail || missing("privacy email"),
    grievanceOfficer: () => (go.name ? `${go.name}, ${go.designation}${go.email ? ` · ${go.email}` : ""}${go.phone ? ` · ${go.phone}` : ""}${go.address ? ` · ${go.address}` : ""}` : missing("Grievance Officer's name and contact details")),
    jurisdiction: () => c.courtsCity || missing("city"),
    currencyCap: () => "₹5,000",
    reminderDays: async () => String(await getConfig("billing.reminderDays")),
    grievanceReplyDays: () => String(rules.grievanceReplyDays),
    dataTransfer: () => rules.dataTransferNote,
    serviceProviders: () => active.length
      ? active.map((v) => `- **${v.name}** — ${v.purpose}. Data: ${v.data}. Location: ${v.where}.`).join("\n")
      : "- Hosting provider only.",
    retentionTable: async () => (await retentionSchedule()).map((r) => `- **${r.what}:** ${r.keep}`).join("\n"),
  };
  let out = body;
  for (const [k, fn] of Object.entries(values)) if (out.includes(`{{${k}}}`)) out = out.split(`{{${k}}}`).join(await fn());
  return out;
}
