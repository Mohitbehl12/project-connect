# Data Retention and Deletion Policy (draft)

**Source of truth: the live settings.**
- The table below shows the defaults in `src/lib/config.ts`.
- Admin → Settings can change them.
- The public Privacy Policy and `/api/privacy/retention` always show the current values.

| Data | Kept | Then |
|---|---|---|
| Deleted messages | 90 days (for safety review) | Purged |
| Messages in ended chats | 90 days | Purged, unless reported or on hold |
| Reported chats (evidence) | 365 days after the chat ends | Purged, unless on hold |
| Closed reports | 730 days | Free-text details removed; category and outcome kept |
| Sign-in history | 365 days | Purged (meets DPDP r.8(3)'s one year, and CERT-In's 180 days if hosted in India) |
| Call metadata (never audio/video) | 180 days | Purged |
| Call requests, notifications | 90 days | Purged |
| Resolved risk signals | 365 days | Purged |
| Automated decisions | 730 days | Purged |
| Audit log | 3 years | Purged |
| Selfie for verification | Until the decision | Deleted |
| Date check-in contact email | 1 week after the date | Deleted |
| Payments and invoices | As tax law requires (India: 8 years from the annual return date, CGST s.36) | Kept, minimised |
| Inactive accounts | Off by default | When set: warned, then deleted 30 days later |

- **Account deletion.** Deletion is immediate. If the account was reported or is on legal hold, it is anonymised instead, so the evidence survives until its period ends.
- **Retention job.** A daily job applies all of the above and skips accounts on legal hold.

## Legal notes (for the lawyer)

- **Three-year erasure (DPDP Rules 2025, Third Schedule).** This applies only to social media intermediaries and e-commerce entities with at least 2 crore registered users in India. Discover is far below that, so it is not mandatory; the optional inactive-account setting covers it as good practice.
- **One-year log retention (DPDP Rules 2025 r.8(3)).** The rule requires keeping personal data, traffic data and logs of processing for at least one year. Sign-in history now defaults to 365 days (was 180). A value saved earlier in Admin → Settings overrides the default — check it says 365.
- **Registration data (IT Rules 2021 r.3(1)(h)).** It must be kept 180 days after the account is closed. Anonymised accounts keep the minimum needed — the lawyer should confirm.
