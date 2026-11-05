# Anti-Fraud Policy (draft)

## Risks we guard against

- Romance and investment scams.
- Fake and catfish profiles.
- Stolen photos.
- Bots and mass messaging.
- Ban evasion.
- Payment fraud and chargebacks.
- Referral and offer abuse.

## Controls

- **Risk signals add up to a score, never a verdict** (`lib/risk.ts`). Signals:
  - shared device and sign-up bursts;
  - mass messaging and repeated message flags;
  - call-request spam;
  - new-device logins after failures and device churn;
  - chargebacks, failed payments and offer reuse;
  - repeated reports;
  - **duplicate photo:** a new photo matches a photo on another account (64-bit difference hash; not a face template).
- **Responses:**
  - MEDIUM is watched.
  - HIGH and not verified → restricted until the person passes the selfie check or staff review it.
  - Nothing bans automatically.
- **Slow-burn romance scams.** Money talk (loans, bills, emergencies, investing, payment apps) in a chat older than 7 days with 30+ messages and no date planned warns the receiver and adds a light risk signal. Nothing is blocked.
- **Message screening.** It looks for:
  - money and investment talk;
  - requests for one-time codes, PINs, card, bank or ID details;
  - moves to other apps;
  - shortened links, raw-IP links, punycode links and app files (refused outright).

  The receiver gets a plain warning. Kinara staff never ask members for codes or payments.
- **Verification.** Phone and email codes, plus the selfie check. Badges say exactly what was checked.
- **Payments.** Razorpay and the app stores handle card data; Kinara never sees it. Refunds need two people.

## Response

- Confirmed scam or fake → ban, preserve evidence, and warn the people they contacted where lawful.
- Victims are pointed to cybercrime.gov.in / 1930 (India) or local police.

## Measuring

Admin → Privacy & compliance → Moderation quality shows, for each screening rule:
- how often a person agreed (actioned);
- how often they disagreed (dismissed).

A rule with many false positives is narrowed, after a person reviews the cases.
