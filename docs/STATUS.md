# Status, testing report and next phases

_Last updated: 13 October 2026_

## Payments, security and privacy (13 October 2026)

Built to the payments/security brief. Full details: `docs/PAYMENTS.md`.

- **Billing:**
  - Configurable price groups. India: men ₹1 for 15 days, then ₹100/month; everyone else ₹1 for 30 days, then ₹50/month.
  - An offers engine: intro, discount and one-off passes, with flash, festival, welcome-back and weekend examples.
  - Coupons.
  - A transparent checkout with a terms checkbox and a price-changed guard.
  - A Razorpay gateway with signature-verified, idempotent webhooks.
  - Renewals, a grace period, reminders, cancel, resume and plan change.
  - Serial GST-style PDF invoices.
  - Refunds under a two-person rule.
  - An admin payments dashboard, plus offer, coupon and price editors.
- **Referrals and fraud:**
  - Invite codes, rewarded once the friend is verified.
  - Self-referral rejection and a monthly cap.
  - Risk scoring (Low/Medium/High) with a review queue. Nothing is banned automatically.
- **Security:**
  - Argon2id, sign-in history, new-device alerts and optional 2-step codes (replay-safe).
  - Device list with immediate sign-out, and log out everywhere.
  - Password change.
  - CSP, HSTS and CSRF origin checks.
  - AES-256-GCM encryption at rest for messages, with key rotation.
  - Finance and Security staff roles.
- **Privacy:**
  - A Privacy Center: hide distance, verified-only likes, blocked list.
  - Download my data and delete my messages.
  - Account deletion that keeps only payment records required by law.
  - Retention purges.
- **App:**
  - New tabs: Discover · Matches (with "Likes you") · Messages · Explore · Profile.
  - A redesigned Premium screen, checkout review, pay page and payment result.
  - New screens: My subscription, Invite & earn, Privacy Center and Security.

| Check | Result |
|---|---|
| Unit tests | **45 / 45** |
| End-to-end against the production build | **224 / 224** |
| Typecheck (server and app) | clean |
| App screens in a phone-sized browser, plus admin pages | no runtime errors |
| Independent code review of payments and security | 10 issues found, all fixed and covered by new tests |

**Not live yet:**
- Real money needs Razorpay keys and a test-mode rehearsal.
- iPhone needs Apple in-app purchase (not built).
- Android in-app needs Play Billing or Google's user choice billing (not built).
- Messages are encrypted on our servers but **not end-to-end**; the app says so.

## Mobile app (October 2026)

The iOS/Android app lives in `mobile/` (Expo SDK 57). Phases 0–3 of the mobile plan are built: backend for mobile, app shell and design system, onboarding and profile, discovery, match and chat. See `mobile/README.md` to run it on a phone with Expo Go.

| Check | Result |
|---|---|
| API end-to-end, now including token refresh and reuse detection, photo upload/EXIF stripping/reorder/delete, partial profile, compatibility breakdown, undo, push registration | **126 / 126 pass** |
| Unit tests (incl. overall score agreeing with the per-factor bars) | **22 / 22 pass** |
| App typecheck | clean |
| App journey in a phone-sized browser (390 × 844), light and dark: welcome → sign-in → discover → profile → likes → match moment → chat → matches → messages → profile → compatibility → premium → safety, plus sign-up and onboarding | no runtime errors |

Not yet verified: real iPhone and Android devices (gestures, haptics and performance can only be judged there), VoiceOver/TalkBack passes, small and large phone sizes.

**Visual upgrade (13 October):** floating glass tab bar with a sliding indicator; soft ambient light behind screens; full-bleed Discover card with photo tap-through (tap the left/right edge of the photo), a quoted profile answer, drag glyphs and a like burst; glowing action buttons with a sunset Like; match moment with glow, particle burst and three tappable conversation starters; profile hero with the name over the photo; gradient rings for new matches in Messages; gradient chat bubbles; welcome screen with an animated card collage and new copy ("Meet someone worth staying for." / "Find my match"); richer placeholder photos (rim-lit silhouettes, horizon scenes, bokeh — still abstract, never real people; regenerate with `npm run db:seed-photos -- --force`). Re-tested: 22/22 unit, 126/126 E2E, app typecheck clean, light and dark journey with no runtime errors.

**Changed during this phase:** the compatibility score is now the plain weighted average on the same scale as the five bars (previously stretched into a 40–99 band, which made "71% overall" sit above bars of 5–50%). Scores shown to people will be lower and more honest.

## Test results (web build, 8 October)

| Suite | Result |
|---|---|
| Unit tests (`npm test`) — matching engine, eligibility, distance labels, age gate, moderation rules, starters | **21 / 21 pass** |
| End-to-end API journey (`npm run test:e2e`) against the **production build** | **96 / 96 pass** |
| TypeScript (`npm run typecheck`) | clean |
| Production build (`npm run build`) | passes |
| Visual review | landing, register, onboarding, discover, likes, chat, settings, plans, admin dashboard, reports, report evidence, settings — desktop 1360px and mobile 390px, Chromium |

The E2E journey covers: guards (401, under-18 blocked, terms required, weak password) → User A and B register, verify email + phone OTP, profile (rejects contact details), preferences, personality, selfie request → admin verifies both → A discovers B with score, reasons, verified badge and no private fields → like, duplicate rejected, B sees hidden like, B likes back → match + notifications → chat, read receipts, scam message flagged with recipient warning, unanswered cap, message delete permissions, stranger blocked → date planner (private place refused, past refused, confirm rules) → report + block + unmatch closes chat and hides profiles → admin stats, search, user detail, match list, report queue with priority, automated report, evidence, suspend, close, ban + session revocation + login refusal, audit trail → config and legal four-eyes → plans by country, mock subscription, entitlement gating.

### Bugs found and fixed during testing

| # | Severity | Bug | Fix |
|---|---|---|---|
| 1 | Medium | Compatibility reasons could crowd out "same city" and "verified" | Max one personality reason; concrete reasons first (caught by unit test) |
| 2 | High | Session cookie marked Secure on plain-http localhost → login silently failed on `npm start` in Safari | Secure on all hosts except localhost |
| 3 | Medium | Seeded users never accepted legal documents → every test login hit the policy gate | Seed records acceptances |
| 4 | Low | Policy gate showed a close button that did nothing | Modal supports non-dismissable mode |
| 5 | Low | Report page offered "Approve verification" regardless of status | API returns selfie status |
| 6 | Medium | Mobile: discover action buttons overlapped profile text; chat header scrolled off-screen | Docked action bar; fixed-height chat panel |
| 7 | Low | Interest names capitalised mid-sentence; prices showed ".00" | Formatting fixes |

Open: **0 critical, 0 high.** Medium/low items are listed under known gaps.

Not yet tested: Safari, Firefox and Edge rendering (only Chromium was available in the build environment); real Android/iOS devices; load testing.

## Mocked — must be replaced before real users

| Feature | Current state | To make it real |
|---|---|---|
| OTP delivery | Codes logged to the server console; returned in API responses when `DEV_SHOW_OTP=true` | SMS provider (MSG91 / Twilio — India needs DLT template registration) and email (Resend / SES) in `src/lib/otp.ts` |
| Selfie verification | Request goes to a manual moderator queue; no image captured | Liveness + face-match vendor (e.g. HyperVerge, Onfido, AWS Rekognition); store only the result |
| Payments | Test provider ("TEST MODE" pay page). Razorpay integration written, not yet run against a live account | Add Razorpay keys + webhook secret, rehearse in test mode (docs/PAYMENTS.md §3); Apple in-app purchase and Google Play billing for the native apps |
| Photo moderation | Upload, crop, EXIF stripping, resizing, quality hints and the 6-photo limit are built; photos go live without a nudity/violence check | Add Rekognition, Sightengine or Hive in `src/lib/photos.ts` and start photos as PENDING |
| Photo storage in production | Local disk driver; S3-compatible driver written but untested | Create an R2 bucket and set `STORAGE_DRIVER=s3` and the `S3_*` variables |
| Push notifications | App registers its Expo push token; server sends through the Expo Push service when `PUSH_ENABLED=true` | Run `eas init` so the app has a project ID, test on a real device |
| Email / SMS | Not sent | Email provider and SMS provider (DLT templates in India) |
| Approximate city on the device list | Not shown | IP-location service |
| Realtime chat | 4-second polling, no typing indicator | Ably, Pusher or Supabase Realtime publishing from `POST /messages` (mobile Phase 4) |
| Google / Apple sign-in | Not built | OAuth with Auth.js or direct provider SDKs |
| Legal text | Placeholder documents | Lawyer-drafted per launch country, including the DPDP Act 2023 (India) and GDPR/UK GDPR |
| Emergency numbers | Listed on Safety pages | Verify per country before launch |

## Not built yet (from the original brief)

Voice/video calls, voice messages, image and GIF sharing in chat, typing indicators, AI profile assistant, AI conversation suggestions and photo-quality help, ML fake-profile detection, travel mode and boosts (entitlements exist; the features don't), PDF export of legal documents (use the browser's Save as PDF on the public page), multi-language UI, native mobile apps.

## Known gaps (medium / low)

- Rate limiter is in-memory per server instance → move to Redis/Upstash before running several instances.
- CSRF protection relies on SameSite=Lax cookies plus JSON-only API bodies; add an Origin check middleware for defence in depth.
- Deleted messages are kept for safety review; a scheduled purge after 90 days still needs adding (and must match the Privacy Policy).
- No date reminders yet (needs a scheduled job).
- No password reset flow yet (needs email delivery).
- Discovery scores up to 1,000 candidates per request; see the scaling path in ARCHITECTURE.md.
- Admin analytics are computed live; add caching once the user base grows.

## Recommended next phases

1. **Photos + moderation** — the biggest gap for a dating product.
2. **Real OTP + password reset** (email/SMS providers).
3. **Payments** — Razorpay first for India, then Stripe.
4. **Realtime chat + push notifications.**
5. **Selfie liveness vendor.**
6. **AI features** — profile assistant and conversation suggestions using an LLM API, with safety review.
7. **Native apps** — Expo/React Native against the same API.
8. **Postgres migration** when nearing ~50k users.

## Launch checklist

- [ ] Lawyer-reviewed legal documents published via Admin → Legal
- [ ] `DEV_SHOW_OTP=false`, `ENABLE_MOCK_PAYMENTS` removed
- [ ] Seed test users removed; default staff passwords changed
- [ ] Grievance officer named (India IT Rules) and contact pages updated
- [ ] Error monitoring (Sentry) and uptime checks on
- [ ] Data-retention purge job running
- [ ] Backups enabled on the production database

## Forgot password
- Done and tested end-to-end (12 checks): same answer for unknown emails, single-use hashed tokens, 30-minute expiry, weak passwords refused, every session signed out, rate limits.
- Not yet live-tested: actual email delivery via Resend (needs `RESEND_API_KEY` + `EMAIL_FROM`).

## Pricing v2 (India) and colour themes
- Done and tested: billing periods per plan. Men pay ₹100/month, ₹250/3 months, ₹500/6 months or ₹1,000/year. Women and everyone else get 90 free days on finishing sign-up, then pay ₹50/month or ₹500/year. All of this is editable in Admin.
- Done: 10 colour themes the member picks in Settings › Colour theme. The choice is saved on the phone. Every theme passes the AA contrast check (`npm --prefix mobile run check:themes`). The website uses Lilac + mint.

## iPhone and Android apps (store-ready code)
- Done and tested: App Store and Google Play subscriptions. The app buys through the store, the server verifies every purchase (Apple's signed transactions, Google's Play Developer API), and store notifications cover renewals, cancellations, grace periods and refunds. There is also Restore purchases, a "Manage in App Store / Google Play" link, and a store notice shown when an account is deleted. 8 unit checks cover Apple signature verification; 25 end-to-end checks run the whole flow using clearly labelled test tokens.
- Done: native settings (no microphone or unused storage permissions, iOS privacy manifest, export-encryption flag), development/preview/production build profiles, and a development client for testing purchases. The native projects generate cleanly and the iOS and Android code compiles.
- Not yet run against the real stores or built into installable apps: that needs the Expo, Apple and Google accounts. See docs/STORES.md for products, settings and notification URLs.

## Grievances, backups, OTP delivery, app builds
- Done and tested: Grievance Officer complaints (IT Rules 2021): public form, instant reference number and acknowledgement, 15-day deadline (24 hours for intimate images or impersonation), admin queue with deadlines and email replies, contacts editable in Admin and shown on /contact, /grievance and in the app. 11 end-to-end checks.
- Done and tested: encrypted database backups every 6 hours (folder now, cloud storage once set up), retention, "Back up now", and a restore tool. A restore was tested here: integrity ok, all accounts present.
- Done, untested live: OTP by email (Resend) and SMS (MSG91), switching on once keys are added.
- Done: GitHub workflow that builds the apps on Expo once EXPO_TOKEN is added; reviewer demo-account script.

## Review fixes (design, features, safety, payments)
- Photo checks: no photo reaches other people unchecked. Explicit photos are refused automatically once Sightengine keys are set (untested against a live account); borderline ones, and every photo while no scanner is set up, wait in Admin → Photo review. The app shows "Being checked".
- Instant chat: new messages, deletions and read receipts arrive at once (long polling, one server), plus "…is typing". With several servers this needs Redis pub/sub.
- Honest offers: urgency words ("today only", "ends soon"…) are refused unless the offer really ends within 48 hours. Discounted INR prices are rounded to whole rupees.
- Gender change after sign-up adds a risk signal for staff review (prices differ by gender); it never blocks the change.
- Tests: 66 unit, 339 end-to-end.

## Safety and features round 2 (on-server checks, selfie verification, calls)
- On-server photo check: bundled models, so no outside service. Clearly explicit photos are refused, borderline ones go to staff, and if the check can't run, photos go to staff. It needs about 300 MB of extra memory, so it's **off on the Render Starter plan** (`PHOTO_SCAN_LOCAL=false`). Turn it on after moving to Standard (2 GB) or larger.
- Selfie verification:
  - The member does a random pose with the front camera, and the server checks there's exactly one face.
  - It then compares the face with their profile photos. "Strong" is under 0.45. Two different people scored 0.57 in testing, so a person always makes the final decision.
  - Staff see the selfie, the pose and the profile photos side by side. The selfie is deleted once they decide.
  - With the on-server check off, staff compare by eye ("Automatic check didn't run").
  - 15 end-to-end checks.
- Voice and video calls between matches (docs/CALLS.md):
  - Locked until both people have messaged. Blocking ends a call. Missed-call notices.
  - With a TURN relay, the call goes only through the relay, so neither person sees the other's IP address.
  - 25 end-to-end checks, plus a real two-browser video call on the web app.
  - **Off in production until a TURN relay is set up.** Not yet tried on real phones.
  - Phones only ring while the app is open, until push notifications are set up.
- Tests: 68 unit, 407 end-to-end.

## Notifications, multiple servers, sample data, iPhone photos
- **Web app notifications.** New messages, matches, likes and incoming calls send a notification to the home-screen app on iPhone (iOS 16.4+) and to Android browsers, with no Apple or Google account needed. The app explains how to turn them on (on iPhone: Add to Home Screen first).
  - The keys are created automatically and stored encrypted.
  - Notifications contain only the in-app notification text, never message contents.
  - They go only to the real push services, so the server can't be used to send requests elsewhere.
  - Addresses the push service reports as gone are forgotten.
  - Signing out stops notifications on that phone.
  - 13 end-to-end checks use a stand-in push service and decrypt what the server sends.
  - **Not yet tried on a real iPhone.**
- **Several servers (docs/SCALING.md).** With `REDIS_URL` set, chat changes, typing, calls and rate limits are shared between servers.
  - Tested with two servers and one person on each: 8 checks. All 421 end-to-end checks also pass with Redis on.
  - Moving off the single disk also needs a shared database (Turso/libSQL) and object storage (S3/R2).
- **Database:** waits briefly for locks instead of failing, and uses write-ahead logging.
- **Sample data** for testing: matches, chats and likes for the demo accounts (`scripts/sample-data.ts`). Remove it before launch.
- **iPhone photos:** photos and selfies are converted to JPEG on the phone before upload. iPhone HEIC photos and photos over 10 MB used to fail.
- Tests: 68 unit, 421 end-to-end, 8 two-server.

## Kinara (rename), membership v3, call requests, chat media, clothing
- **Renamed to Kinara**, with a new icon set. `npm run brand:rename -- "Old" "New"` renames it again.
- **Membership:**
  - Women and everyone not a man (India): every plan free for life.
  - Men: 15-day free trial, then ₹100/month (or ₹250 / ₹500 / ₹1,000 for 3, 6 or 12 months).
  - Membership states are shown on the profile.
- **Call requests:** nobody can be called without accepting a request first. Includes call history, call settings, Speaker and Block on the call screen, and an admin Calls page.
- **Chat:**
  - Photos: blurred until tapped, location data removed.
  - Voice messages, hearts, and a "send anyway?" check before hurtful messages.
  - Media from reported chats is kept as evidence.
- **Calls relay:** Cloudflare TURN built in. Paste `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` to switch calls on.
- **Kinara Style (docs/STYLE.md):** the custom-clothing section merged from Darzi, with a workshop admin and the TAILOR role.
- **Admin dashboard:** men and women, free trials, free-forever members, paid memberships, ₹100 subscriptions, payments, call requests (accepted / declined), calls, clothing orders and revenue.
- **Tests:** 72 unit, 601+ end-to-end, 9 two-server.
