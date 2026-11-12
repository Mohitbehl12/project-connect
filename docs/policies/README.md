# Internal policies and plans (drafts for review)

**Status: DRAFT — not legal advice, not published to members.** Each policy below describes how Discover staff and
systems actually work today, with the code that enforces it. A qualified lawyer must review them for every
launch country before they are adopted. Member-facing documents live in `legal/` and are published only through
Admin → Legal (four-eyes, versioned). Nothing in this folder changes them.

| Policy | Covers | Enforced by |
|---|---|---|
| [Age verification](age-verification.md) | 18+ only, layered age assurance, suspected minors | `api/auth/register`, `lib/compliance.ts`, `lib/moderation.ts` (MINOR), `lib/safety.ts` (underageCheck) |
| [Anti-harassment](anti-harassment.md) | Harassment, threats, stalking, intimate-image abuse | `lib/moderation.ts`, reports, blocks, call consent |
| [Anti-fraud](anti-fraud.md) | Fake profiles, scams, catfishing, ban evasion | `lib/risk.ts`, `lib/fraud.ts`, duplicate-photo check, selfie check |
| [Content moderation](content-moderation.md) | Queues, review targets, evidence, emergencies, CSAM | `lib/reportSla.ts`, `lib/safety.ts`, Admin → Reports |
| [Suspension and appeals](suspension-appeals.md) | Restriction, suspension, ban, appeal, four-eyes | `lib/appeals.ts`, `lib/safety.ts` |
| [Data retention and deletion](data-retention.md) | What is kept, how long, legal holds | `lib/privacy.ts`, `lib/config.ts` (retention.*) |
| [Grievance redressal](grievance.md) | Grievance Officer, deadlines | `lib/grievances.ts`, `/grievance` |
| [AI governance and moderation](ai-governance.md) | Automated decisions, human review, quality monitoring | `lib/safety.ts`, `lib/moderationQuality.ts` |
| [Incident response](incident-response.md) | Security incidents, CERT-In 6-hour report | Admin → Engineering, monitor |
| [Data breach response](data-breach-response.md) | Personal-data breaches: DPDP, GDPR | — (people and process) |
| [Disaster recovery](disaster-recovery.md) | Backups, restore, targets | `lib/backup.ts`, `scripts/restore-backup.ts` |

Member-facing documents that already exist in `legal/`: Terms of Service, Privacy Policy, Community Guidelines,
Safety Policy, Cookie Policy, Subscription & Payment Terms, Cancellation & Refund Policy, Advertising Terms.
