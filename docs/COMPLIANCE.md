# Privacy, safety and legal readiness

_Last updated: 21 October 2026_

This maps each section of the "Legal, privacy & safety-first requirements" brief to what Kinara does, where it is in the code, and what is still needed. **Nothing here means Kinara is "legally compliant" or "secure".** A qualified lawyer must review the legal documents, consent wording and country rules, and an independent firm must test security, before real members join. The app never makes those claims. Admin → Launch readiness tracks the sign-offs.

Status key: **Built** = working and covered by tests · **Partly** = works, with the gap stated · **Needs you** = needs a person, account or contract.

| # | Requirement | Status | How Kinara does it |
|---|---|---|---|
| 1 | Eligibility | Built | Date of birth at sign-up (under 18 refused) plus an "I'm 18+" box. A per-country minimum age is checked when the city/country is saved. Japan is set to "selfie check before liking". Two reports of a possible minor hide the account for review. We collect no ID documents. |
| 2 | Consent | Built | `consents` table, append-only: what, when, version, source and IP. Terms, privacy, age and safety rules are recorded at sign-up. Marketing is optional and never pre-ticked. Camera, microphone, notifications and calls are recorded when the phone asks. Members see and change consents in Privacy Center › Your consents. |
| 3 | Terms of Service | Partly | Full draft in `legal/terms.md` covering all listed topics. Needs lawyer review per launch country. |
| 4 | Privacy Policy | Partly | Full draft in `legal/privacy.md`. The service-provider list and retention table are filled from live settings. Needs lawyer review. |
| 5 | Sensitive data | Built | No GPS and no ID documents. Selfie deleted after the decision. Photos have location data removed. Messages and 2-step secrets are encrypted at rest (AES-256-GCM). Argon2id passwords. TLS. The clothing feature and its body measurements were removed (migration 0012). |
| 6 | Location privacy | Built | City-only location, stored at about 1 km precision. Distances are bucketed ("Within 5 km", "Within 10 km", nearest 10 km). Members can hide distance or city. Coordinates never appear in any API (E2E checks discovery, /me and export). |
| 7 | Profile privacy | Built | Show in Discover, Incognito, who can like me, who can see my profile (everyone / verified), who sees all photos (everyone / matches), call requests (matches / nobody), blocked list, my reports, pause profile. |
| 8 | Consent-based calling | Built | Request → accept/decline → call. Never auto-connects. Phone numbers are never shared. TURN relay only. Rate limits, cooldown after a decline, and a stop after 3 declines. Block and report on the call screen. |
| 9 | Messaging safety | Built | Screening for scams, threats/sextortion, requests for codes/PINs/bank/ID details, off-platform pushes, contact details and abuse. Shortener, raw-IP, punycode and app-file links are refused. Mass messaging is slowed. A message limit stops one person sending many in a row without a reply. Kindness check. Report, block, mute, delete my messages in a chat, unmatch. Serious flags open a report for human review. |
| 10 | Anti-fraud | Built | Risk signals: shared device, sign-up burst, mass messaging, repeated reports, call-request spam, new-device logins after failures, many devices in a week, payments, referrals. Signals add up to a score, not a verdict. HIGH and not verified → **restricted** (no new contact, hidden) until verified or reviewed. Nothing is banned automatically. Appeals. |
| 11 | Fake profiles / impersonation | Built | Impersonation report category. Selfie check (pose + face match + staff decision), with the app explaining what "verified" does and doesn't mean. Password reset and sign-out of all devices. |
| 12 | Reporting | Built | 13 categories. Case number (KN-R-YYYY-XXXXXX). "Your report has been received." Reporters see status. Priority queue. |
| 13 | Safety escalation | Partly | Critical categories go first. Legal holds preserve evidence. The Safety Policy explains lawful disclosure without promising confidentiality. **Needs you:** a named person and process for law-enforcement requests and emergencies (see below). |
| 14 | Blocking | Built | Blocks both ways for discovery, likes, messages, calls and call requests. The blocked person is not told. Accounts created on the same app install as someone you blocked are hidden from you too. |
| 15 | Account deletion | Built | Immediate. Before deleting, the app shows what is kept and for how long (live retention table). If the account was reported or is on legal hold, it is anonymised instead of hard-deleted, so evidence survives until its period ends. |
| 16 | Data retention | Built | 17 categories, each configurable in Admin → Settings. A daily job deletes or minimises data and skips accounts on legal hold. The schedule is public (`/api/privacy/retention`, Privacy Policy). |
| 17 | Security | Partly | HTTPS/HSTS, CSP, CSRF origin check, Argon2id, optional 2-step for members, rotating refresh tokens, RBAC, field encryption with key rotation, rate limits, input validation (Zod), React output encoding, uploads re-encoded, secrets only on the server, backups, audit log. **Not yet:** malware scanning of uploads (images are re-encoded, which removes most payloads; voice notes are checked by magic bytes only), error monitoring (Sentry), a formal incident-response plan. |
| 18 | Admin security | Built | 2-step verification **required** for staff, plus a lock after 30 minutes idle that needs a fresh code. Least-privilege roles. Every view of private records is logged, and an unusually high number alerts super admins. Approval workflows: legal publishing (four-eyes), refunds (two-person rule), and appeals decided by someone other than the original decider. |
| 19 | Audit logging | Built | Hash-chained (each row includes the previous row's hash). Admin → Privacy & compliance verifies the chain. Covers sign-in, account, password, profile privacy, consent, reports, blocks, suspensions, deletion, admin access, payments and security. It is tamper-*evident*, not tamper-proof: copy the latest hash off the server regularly for stronger proof. |
| 20 | Payment safety | Partly | Razorpay (cards never touch Kinara). Checkout shows price, currency, period, renewal, taxes and terms. Renewal reminders. Easy cancellation. **Needs you:** Razorpay keys and a test-mode rehearsal. |
| 21 | Women free / men ₹100 | Built (needs legal review) | Pricing is shown on the sign-up screen before an account exists. The men's 15-day trial needs no card and is never charged automatically. **A lawyer must confirm gender-based pricing is lawful** in each country (it is unlawful in some, e.g. the EU). It is limited to India by configuration. |
| 22 | User-generated content | Built | Terms give the rights licence and the uploader's warranty. A notice sits at photo upload. Photos are screened. Report and remove. |
| 23 | Child safety | Built | Age gate, underage report → hidden after 2 reporters, zero-tolerance policy in the Guidelines and Terms. **Needs you:** a process to report CSAM to the authorities (India: NCRB portal; US: NCMEC). |
| 24 | Third-party inventory | Built | `src/lib/vendors.ts`: data shared, purpose, location, security, retention, whether active (from live settings), DPA status per provider. Public page `/legal/service-providers`. |
| 25 | AI safety | Partly | No protected characteristics are used or inferred. Automated decisions are logged with plain reasons, members can see and appeal them, and serious enforcement is decided by a person. Compatibility is labelled as an estimate. **Not yet:** a formal bias test of the matching weights on real data. |
| 26 | Legal versioning | Built | Versions with status, effective date, "what changed", material vs minor change (only material asks members to accept again), and a lawyer-review record. The public page shows "Draft for review" until a review is recorded. |
| 27 | Compliance architecture | Built | `src/lib/compliance.ts` with per-country rules (open/closed, minimum age, age check, privacy law, complaint deadlines, cooling-off, tax display, data-transfer note, lawyer review). Overrides live in configuration (Admin → Privacy & compliance), not code. |
| 28 | Legal review checkpoint | Built (tracking) | Admin → Launch readiness: 15 legal items with who/when, plus automatic checks (test codes, mock payments, sample users, unreviewed documents, contacts, DPAs, staff 2-step, backups, TURN, audit chain…). |
| 29 | Security testing | Partly | `npm run test:security`: 56 attack-style checks, passing with staff 2-step switched on. They cover authentication on all 120+ API routes, member access to staff routes, cross-account access to chats/media/calls/Cupid, token forgery (edited payload, alg:none), mass assignment and role escalation, SQL/script injection, fake and oversized uploads, media path traversal, CSRF, security headers, account enumeration, password guessing and data leakage. Fixes from this round: uploads now check membership and size before reading the body; vulnerable postcss and sprintf-js versions were overridden. Remaining: a moderate advisory in sprintf-js under TensorFlow's command-line parser, which is never given user input and has no fixed release. Also: 80 unit tests and 739 end-to-end checks. **Needs you:** an independent penetration test (tracked as 16 sign-off items). |
| 30 | Release gate | Built (tracking) | Security / Privacy / Safety / Legal / Abuse-testing sign-off items on Launch readiness. |

## What only you can do before launch

1. **Lawyer:**
   - Review the 7 documents in Admin → Legal, then record the review.
   - Confirm the country rules and the gender pricing.
   - Fill in the company name, address, Grievance Officer and courts city (Admin → Settings → Contacts).
2. **Contracts:** sign data processing agreements with every active provider (Render, Razorpay, Cloudflare, email/SMS), then mark them in Admin → Privacy & compliance.
3. **Security:** commission an independent penetration test, and sign the items off.
4. **People and process:**
   - Name who handles urgent safety reports and law-enforcement requests, and how fast.
   - Set up CSAM reporting to the authorities.
   - Write a breach response plan (India's DPDP Act and GDPR have notification duties).
5. **Clean-up:** remove the sample people and turn off test settings (Launch readiness lists them).

## Technical notes

- **Staff 2-step.** Production always requires it. `ADMIN_MFA_OPTIONAL=true` exists only for local automated tests; Launch readiness flags it. A locked-out admin can recover with `ADMIN_RESET_PASSWORD` (see docs/DEPLOYMENT.md), which also clears their 2-step.
- **Legal drafts.** On start-up, `scripts/legal-drafts.ts` replaces any placeholder legal text with the drafts in `legal/*.md` (as a new published version). It never overwrites text edited in Admin → Legal.
- **Legal holds.** Admin → Privacy & compliance. Retention skips held accounts. Deleting a held account anonymises it instead of removing it.
- **Two-server set-ups.** The audit chain uses a unique sequence with retry, so it stays linear across servers. This was tested with 60 concurrent writes on two servers.
