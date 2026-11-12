# Content Moderation Policy (draft)

## Sources of work

1. Member reports. There are 14 categories, each with a case number (KN-R-YYYY-XXXXXX), and members can track status in Safety.
2. Automated screening: messages, profile text and photos.
3. Formal complaints to the Grievance Officer.
4. Requests from authorities.

## Priority and review targets

Targets are set in `REPORT_REVIEW_HOURS` (`src/lib/constants.ts`):

| Priority | Categories | Review within |
|---|---|---|
| Critical | Possible minor, threats, sexual misconduct, intimate-image abuse, "I feel unsafe" | 12 hours |
| High | Harassment, scam, fraud, impersonation | 24 hours |
| Medium | Unwanted contact, fake profile, inappropriate content | 3 days |
| Low | Spam, other | 7 days |

- **Staff view:** Admin → Reports shows "Due in / Overdue" on every open report.
- **Member view:** the reporter is told "usually within …" (a target, not a guarantee).
- **Quality view:** Admin → Privacy & compliance → Moderation quality shows on-time rates and median hours.

Legal backstops in India (IT Rules 2021):
- Acknowledge grievances within 24 hours and resolve them within 15 days (r.3(2)(a)).
- Remove intimate images or impersonation within 24 hours of a complaint (r.3(2)(b)).
- Act on unlawful-content removal requests within 72 hours (r.3(2)(a), as amended 2022).

## Who reviews

- Moderators (`reports.resolve`) decide reports.
- Moderators see reported messages only (`messages.view_reported`), never whole inboxes.
- Every view of private records is logged, and an unusual number of views alerts super admins.

## Evidence and legal holds

- Reported chats are kept for 365 days after the chat ends (`retention.reportedChatDays`).
- A legal hold (Admin → Privacy & compliance) stops purges and makes account deletion anonymise instead.
- Removed content is preserved for 180 days for investigation (IT Rules r.3(1)(g)) unless a hold extends it.

## Emergencies

- Discover does not contact emergency services automatically.
- Members are told to call 112 (India), 911 (US) or 999 (UK) first.
- If a moderator sees a credible, imminent threat to life:
  - the case goes to the named safety lead;
  - the safety lead may disclose the minimum necessary data to police, as the Privacy Policy and Safety Policy describe;
  - each disclosure is recorded in the audit log with its legal basis.

## Child safety

- Confirmed minor → ban, hold, end all chats.
- Sexual content involving a minor, or an adult soliciting a minor:
  - preserve the evidence;
  - do not forward or copy the material;
  - report to the authorities — in India the police or cybercrime.gov.in (POCSO Act s.19–20; IT Act s.67B);
  - for US members, the NCMEC CyberTipline where US law applies.

**Needs owner:** the named person and written steps for this.

## Requests from authorities

- Verify the request is genuine and lawful (IT Rules r.3(1)(j): information within 72 hours of a lawful order).
- Disclose only what is asked.
- Record it in the audit log. Members are told unless the law forbids it.
