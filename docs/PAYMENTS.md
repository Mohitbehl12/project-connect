# Payments, offers, security and privacy

_Last updated: 13 October 2026_

This covers the money side of Project Connect: how prices and offers are chosen, how a payment flows, how to go live with Razorpay and the app stores, and the security and privacy controls that came with it.

**Not legal or tax advice.** Before launch, have a lawyer review gender-based pricing, auto-renew terms and the refund policy, and a chartered accountant review the invoice format and GST treatment.

---

## 1. Pricing at a glance

| Who (India) | Today | Intro | Then |
|---|---|---|---|
| Men | ₹1 | 15 days | ₹100 / month |
| Women, non-binary and anyone who hasn't said | ₹1 | 30 days | ₹50 / month |

None of these numbers are in the code. They are seeded data that staff can change in the admin panel.

**Plan prices.** Admin → Settings & prices → Plans and prices. Each price row has a country, a currency, an amount and a **price group**:

- "Everyone else" applies to anyone not in a specific group.
- "Men", "Women" and "Non-binary" are the specific groups.

**Countries where gender groups apply.** Admin → Settings & prices → Billing, field `billing.genderPricingCountries`, default `IN`.

- Outside those countries, gender groups and gender-limited offers and coupons simply don't apply. Everyone gets the "Everyone else" price.
- The admin panel refuses to create a gender-limited offer for a country that isn't listed.
- Gender-based pricing is unlawful in some places, such as the EU's goods-and-services rules and California's Unruh Act. Get legal advice before adding a country.

**Offers.** Admin → Offers & coupons. There are three kinds:

| Kind | What it does | Seeded examples |
|---|---|---|
| **INTRO** | A low price for N days, then the normal price | "Try Premium for ₹1" for men and for everyone else |
| **DISCOUNT** | A percentage off the first payment | Welcome back 40%; Diwali Special 50% (seeded switched off) |
| **PASS** | A one-off purchase for N days that never renews | Weekend Dating Pass, ₹49 for 3 days |

Each offer has:

- A headline and an optional badge.
- A plan and a country.
- An optional gender limit.
- An audience: everyone, first-time subscribers, or past subscribers (win-back).
- Optional start and end dates.
- A priority.
- A once-per-person flag.

**Coupons.** Admin → Offers & coupons. A coupon can have:

- A percentage or a fixed amount off.
- A maximum discount and a minimum purchase.
- A start date and an expiry date.
- A total usage limit and a per-person limit.
- An audience: new subscribers or existing members.
- Limits by country, plan, or gender (gender only where it's enabled).

Seeded codes: `WELCOME50`, `FIRSTDATE`, `LOVE2026`, and `FESTIVAL50` (switched off).

### Rules people see (kept deliberately simple)

1. **Intro offers are once per person.** That covers the account itself, plus any account sharing its phone number or app install.
2. **A coupon doesn't combine with the ₹1 intro.** Entering one replaces the intro, and the app says so.
3. **A coupon or a DISCOUNT offer lowers today's payment only.** If both apply, the bigger one wins.
4. **Every quote spells out the terms before payment:**
   - today's price;
   - the regular price;
   - the exact next billing date;
   - that it renews until cancelled;
   - how to avoid the next charge.

   The person has to tick "I understand the subscription terms" before paying.
5. **The checkout refuses to proceed if the price changed** after the person saw it (HTTP 409 `price_changed`).
6. **No fake urgency.** An offer shows an end date only if it really has one.

The code lives in `src/lib/pricing.ts`. It is pure functions with unit tests (`tests/unit/pricing.test.ts`).

---

## 2. How a payment flows

```
App/Web ──quote──▶ /api/billing/quote
        ──review + tick terms──▶ /api/billing/checkout ──▶ Payment service (src/lib/billing.ts)
                                                          └─▶ Gateway: Razorpay subscription/order
App opens /pay/<id>?t=<30-min token> in an in-app browser ──▶ Razorpay Checkout (UPI / card / net banking / wallet)
Razorpay ──signed webhook──▶ /api/webhooks/razorpay ──▶ verify HMAC ─▶ record event once ─▶ applyEvent()
                                                                   └─▶ payment CAPTURED, subscription TRIALING/ACTIVE, invoice no., notification
App polls /api/billing/payments/<id> ──▶ "Payment successful" (or a clear failure screen)
```

- **Only a signature-verified webhook turns Premium on.** The browser's "success" callback (`/api/billing/confirm`) only checks the signature so the page can show the right message.
- **Webhooks are idempotent in two ways:**
  - each event id is stored once in `webhook_events`;
  - each gateway payment id is unique in `payments`.

  When several events arrive for the same payment, an atomic "claim" lets only one of them proceed. If processing fails part-way, the claim is undone so Razorpay's retry can finish the job.
- **A retried first payment counts.** A FAILED first attempt can still settle if the person retries on the same order or mandate.
- **A late payment on a replaced checkout is not lost.** If someone pays a checkout they had abandoned or replaced, the money is recorded, a refund request is opened automatically, and nothing is activated twice.
- **We never store** card numbers, CVV, UPI PIN or bank passwords. We keep:
  - the gateway payment, order and subscription ids;
  - amount, currency, plan and status;
  - a method *category* (UPI / card / …);
  - timestamps, invoice number and refund amounts.
- **Renewals** come from Razorpay's `subscription.charged` webhooks.
  - A failed renewal (`subscription.pending` / `halted`) sets the subscription to PAST_DUE. Premium stays on for `billing.graceDays` (default 3) while the gateway retries.
  - A charge on a plan that has been cancelled, has expired, or belongs to a deleted account is recorded and queued for a refund.
- **Reminders.** We send our own renewal reminder `billing.reminderDays` (default 2) days before each charge. This is in addition to the pre-debit notice that banks send for UPI Autopay and card e-mandates.
- **Invoices** are PDFs at `/api/billing/invoices/<id>`.
  - Numbers are serial per Indian financial year, for example `PC/2026-27/000001`.
  - The seller's name, address, GSTIN and GST rate come from `billing.seller`.
- **Cancellation** is one step in the app (My subscription → Cancel subscription).
  - It stops the mandate at the end of the current period, and Premium stays on until then.
  - In test mode it can be switched back on.
  - With Razorpay, a cancelled mandate can't be restarted, so the person subscribes again later.
- **Plan changes** take effect at the next billing date. There is no extra charge today and no proration.
- **Refunds** use a two-person rule:
  - Support, Finance or an Admin opens a request with a reason.
  - A *different* person with refund approval (Finance or Super Admin) approves it.
  - The approval is claimed atomically, so two approvers can't send money twice.
  - Partial refunds are supported, with an optional "end their access now".
  - Every step is audited.

### Scheduled jobs

Call `POST /api/cron/billing` with header `x-cron-secret: $CRON_SECRET` every 15–60 minutes, for example from Vercel Cron, GitHub Actions or cron-job.org. It handles:

- renewal reminders;
- test-mode renewals;
- expiring plans that have run out;
- starting banked reward days;
- data-retention purges.

---

## 3. Going live

### Razorpay (website, and Android alternative billing)

1. **Create keys.** In Razorpay → Settings → API Keys, create **test** keys first.
2. **Set the environment** (from a secrets manager, never in git):
   - `BILLING_PROVIDER=razorpay`
   - `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
   - `APP_URL` = your public https URL
   - `CRON_SECRET`
3. **Add the webhook.** In Razorpay → Webhooks, add `https://<domain>/api/webhooks/razorpay` with a secret, and set it as `RAZORPAY_WEBHOOK_SECRET`. Subscribe to:
   - `payment.captured`, `payment.failed`, `order.paid`
   - `subscription.authenticated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`
   - `refund.processed`, `refund.failed`
   - `payment.dispute.created`
4. **Enable the products.** Turn on Subscriptions and UPI Autopay on the account.
5. **Rehearse in test mode:**
   - a ₹1 intro;
   - a failure followed by a retry;
   - a renewal (Razorpay lets you trigger charges on test subscriptions);
   - cancellation;
   - a refund;
   - a dispute.
6. **Clean up after testing.** Remove `ENABLE_MOCK_PAYMENTS` from production. Without it, the test provider and `/api/billing/mock/*` are switched off.

> The Razorpay integration (`src/lib/payments/razorpay.ts`) is written against Razorpay's documented API and its signature rules are unit-tested, but it has **not yet been run against a live Razorpay account**. Step 5 is required.

Notes:

- **Changing a price.** When a price amount changes in the admin panel, its cached Razorpay plan id is cleared and a new plan is created on the next checkout. Existing subscribers keep their old price until they change plan.
- **Plan length.** Recurring plans must be at least 7 days, which is Razorpay's minimum.

### App stores

- **iPhone.** Apple requires its own in-app purchase for digital subscriptions sold in the app. As far as we could find, there is no general India exception yet; the CCI case is ongoing. The app's Premium screen hides the purchase button on iOS when a live gateway is configured, so it stays within Apple's rules. Adding StoreKit (directly or via RevenueCat) is a separate step. It needs an Apple Developer account, App Store Connect products and server-side receipt validation. It is **not built yet**.
- **Android.** Google Play's billing policy applies too. India has a user choice billing programme that allows an alternative biller, at a 4% lower service fee, alongside Play Billing. Using Razorpay inside the Android app in production requires enrolling in that programme and integrating Play's choice screen. That is **not built yet**. Until then, ship Android with Play Billing, or sell on the website only.
- **Why the app isn't blocked today.** The in-app browser pay page works in test mode and for the website. Both store integrations need native builds (EAS), not Expo Go.

### Sources for the store rules

- Google Play user choice billing, eligible countries including India: https://support.google.com/googleplay/android-developer/answer/13821247
- CCI investigation into Apple's in-app payment rule (2021 report): https://techcrunch.com/?p=2197431

---

## 4. Referrals and rewards

- **How it works.** Each member gets an invite code (for example `C9MV82M`) and a link. A friend who signs up with the code and then **passes selfie verification** earns the inviter `referral.rewardDays` (default 7) Premium days. Rewards are Premium days, never cash.
- **Fraud checks at reward time:**
  - Same app install as the inviter → rejected, and a risk signal is added to the inviter.
  - Same sign-up network as the inviter, or a high-risk friend → held for review (Admin → Risk & referrals).
  - At most `referral.monthlyCap` (default 10) rewards per person per month.
- **If the inviter is already paying,** reward days are banked and start when their paid plan ends.
- **Other rewards, all configurable:**
  - A one-time Discover boost for reaching a 100% profile (`rewards.completeProfileBoostMinutes`, default 30 minutes).
  - Optional Premium days for completing verification (`rewards.verifiedPremiumDays`, default 0).

---

## 5. Fraud and risk

| Signal | Weight |
|---|---|
| Several accounts from one app install | 20; 40 if 5 or more |
| Sign-up burst from one network | 10–30 |
| Intro reuse (blocked at quote time) | — |
| Self-referral | 25 |
| Chargeback | 40 |
| 5 or more failed payments in 24 hours | 15 |
| Repeated message-safety flags | 15–35 |
| New-device sign-in after failed attempts | 10 |

- **How the score works.** Signals add up over 90 days: 30 or more is Medium, 60 or more is High.
- **High risk asks the person to verify before paying.** Their account appears in Admin → Risk & referrals, where a reviewer can clear the signals with a note.
- **Nothing bans or suspends anyone automatically.**
- **The install id** is a random UUID the app generates and keeps in secure storage. It is not a hardware identifier, and it resets when the app is reinstalled.

---

## 6. Security

- **Passwords.** Argon2id (19 MiB, 2 iterations). Older bcrypt hashes are upgraded at the next sign-in.
- **Sessions:**
  - The app gets a 15-minute access token plus a rotating 30-day refresh token. Reusing a refresh token revokes its whole login family.
  - Signing out a device on the Security screen cuts it off **immediately**.
  - "Log out of all devices" also ends web sessions.
- **2-step verification (optional).** Codes from any authenticator app (TOTP, RFC 6238). The secret is stored encrypted, and a code can't be used twice.
- **Sign-in history and alerts.** Every attempt is logged with the network masked (for example `103.21.x.x`). Signing in on a new device sends a security notification.
- **Encryption at rest.** Message text and 2-step secrets use AES-256-GCM.
  - Keys come from `FIELD_KEYS` and `FIELD_KEY_ACTIVE`, and are versioned.
  - To rotate: add a new key, make it active, run `npm run keys:rotate`, then retire the old key.
  - Each message is bound to its conversation, so a ciphertext can't be moved to another chat.
  - In production, keep the keys in AWS Secrets Manager, Azure Key Vault or GCP Secret Manager.
- **Not end-to-end encrypted.** Messages are **not** end-to-end encrypted: the server can decrypt them for safety screening and for reviewing reported conversations. The Privacy Center says exactly this. True E2EE (for example the Signal protocol via libsignal) would mean giving up server-side scam screening; it's a product decision for later.
- **Web defences:**
  - Content-Security-Policy (only Razorpay Checkout is allowed as a third-party script or frame).
  - HSTS in production; X-Frame-Options DENY; nosniff; a strict referrer policy.
  - `no-store` on all API responses.
  - A cross-site request check on any cookie-authenticated change (CSRF).
  - Same-origin-only redirects after login.
- **Pay and invoice links** are signed, single-purpose and short-lived (30 and 10 minutes). Photos use expiring signed URLs.
- **Roles:**

  | Role | Can do |
  |---|---|
  | Finance | Payments, refunds, offers, coupons, prices — never conversations |
  | Security | Risk queue, sign-in hot spots, audit log |
  | Support | View users and reports, and *request* refunds |
  | Moderator | Reported messages — never payments |

  Every change to prices, offers, coupons, refunds and risk is written to the audit log.
- **Known gaps:**
  - The rate limiter is in-memory per instance; it needs Redis or Upstash for multiple instances.
  - The client IP comes from `x-forwarded-for`; only trust it behind your own proxy or CDN.
  - The sign-in lockout message (423) reveals that an account exists.
  - Passkeys, password reset and OTP login need an email/SMS provider and aren't built.

## 7. Privacy

- **Privacy Center (app).** People can:
  - show or hide themselves in Discover;
  - turn on incognito (Premium Plus);
  - choose who can like them (everyone, or verified people only);
  - show or hide their distance (hidden shows only the city);
  - show or hide when they're active;
  - turn read receipts on or off;
  - see blocked people and unblock them;
  - download their data;
  - delete the messages they've sent;
  - delete their account.
- **Download my data** gives a JSON file of everything we hold about the person. Other people appear by first name only. It excludes coordinates and internal fields.
- **Account deletion:**
  - If the gateway can't stop the person's auto-renew, nothing is deleted and they're asked to try again.
  - Otherwise, photos are removed from storage and profile, preferences, likes, sessions and notifications are deleted.
  - Payment records stay for tax, linked to an anonymised placeholder (no email or phone).
  - Deleted messages are kept for `retention.deletedMessageDays` (default 90) for safety review, then their text is purged.
  - Accounts with no payments are deleted outright.
- **Retention** (run by the scheduled job):
  - deleted-message text after 90 days;
  - sign-in history after 180 days;
  - expired sessions after 30 days.
- **Location.** Exact coordinates are never returned to anyone. Other people see a rough distance, or just the city.

## 8. Tests

- **Unit tests:** 45 (`npm test`). They cover pricing, offers, coupons, passes, AES-GCM tamper and rotation, Razorpay signatures and event mapping, the RFC 6238 vector, and risk levels.
- **End-to-end:** 224 checks against the production build (`npm run test:e2e`). The payments and security sections include:
  - quotes per price group;
  - refusing checkout without the terms ticked, or when the price changed;
  - a failure followed by a retry;
  - idempotent repeats;
  - invoices and their access control;
  - signed webhooks: bad signature, renewal, duplicates, forged notes, past due, dispute;
  - cancel, resume and change plan;
  - the cron secret;
  - refunds under the two-person rule and role limits;
  - the admin dashboard, offers and coupons;
  - referral rewards and self-referral rejection;
  - shared-device risk review;
  - sign-in history, 2-step setup, sign-in and replay;
  - device sign-out;
  - the CSRF check and security headers;
  - messages encrypted in the database;
  - privacy controls, data export, deleting messages, and account deletion that keeps payment records.
