# Deployment

_Last updated: 14 October 2026_

The setup is one Render web service in Singapore with a 2 GB persistent disk. Scheduled jobs (renewal reminders, expiry, clean-up) run inside it every 30 minutes. It serves:

| Address | What |
|---|---|
| `https://<your-app>.onrender.com/` | Website: sign-up, discovery, chat, plans |
| `https://<your-app>.onrender.com/admin` | Admin panel |
| `https://<your-app>.onrender.com/app` | The phone app's web version (testers open this on their phone) |
| `https://<your-app>.onrender.com/api/…` | The API that the native app uses |

The database (SQLite) and photos live on the disk, and Render snapshots the disk daily. It runs as a single instance, which is right for launch. When you outgrow it, move the database to Turso or Postgres and photos to Cloudflare R2 (see "Scaling later").

**Cost:**
- The Render Starter instance and about 2 GB of disk come to roughly US$8 a month.
- Check render.com/pricing for current prices.
- A custom domain is optional.

## 1. One-time setup (about 10 minutes)

1. **Get the code into GitHub.** Push this repository to a **private** GitHub repo. `.env`, `data/` and `node_modules` are git-ignored and must stay out of git.
2. **Create the services on Render.**
   - Sign up at render.com and connect your GitHub account.
   - Go to **New → Blueprint** and pick the repo. Render reads `render.yaml` and shows the `project-connect` service.
3. **Enter your admin email.**
   - When Render asks for `SEED_ADMIN_EMAIL`, enter the email you'll use to log in to the admin panel.
   - Leave the Razorpay fields empty for now.
4. **Deploy.**
   - Click **Apply**. The first build takes about 5–8 minutes.
   - On the first start the server creates the tables, plans, offers, coupons, legal pages and your admin account.
5. **Find your admin password.**
   - It's in Render → `project-connect` → **Environment** → `SEED_ADMIN_PASSWORD` (generated, 44 characters).
   - Log in at `/admin`.
   - Go to Settings → Billing and enter your business name, address, GSTIN and billing email. These appear on invoices.
6. **Check it's healthy.** `https://<your-app>.onrender.com/api/health` should show `{"ok":true}`.
7. **Run the full test suite against the live server (optional).** This creates a few test accounts:
   ```bash
   BASE_URL=https://<your-app>.onrender.com SEED_ADMIN_EMAIL=<you> SEED_ADMIN_PASSWORD=<generated> npm run test:e2e
   ```
   The staff-role checks expect the local test accounts, so a few of them will fail on a live server. Every other check should pass.

**Admin password not working, or forgotten?** In Render → Environment, add `ADMIN_RESET_PASSWORD` with a password you choose (12 or more characters) and save. On the next start the admin account for `SEED_ADMIN_EMAIL` gets that password, lockouts are cleared, and the account is created if it's missing. The log shows `✓ Admin password reset`. Then **delete `ADMIN_RESET_PASSWORD`** from the environment.

**Never change or delete `FIELD_KEY_SECRET`.** It encrypts messages; without it, stored messages can't be read. `AUTH_SECRET` can be rotated, but doing so signs everyone out.

## 2. Getting the app to testers

| Option | Effort | Notes |
|---|---|---|
| **A. Web link** | none | Testers open `https://<your-app>.onrender.com/app` on their phone. In Safari or Chrome, "Add to Home Screen" makes it feel like an app. No haptics; photo upload uses the browser picker. |
| **B. Expo Go** (your own phone) | 2 min | On your computer: in `mobile/`, put `EXPO_PUBLIC_API_URL=https://<your-app>.onrender.com` in `.env`, run `npx expo start`, and scan the QR code with Expo Go. |
| **C. Android test build** | 20 min | Install an APK on any Android phone. Steps below. |
| **D. iPhone TestFlight** | later | Needs an Apple Developer account (US$99/year). |

**Option C, an Android test APK:**

1. Create a free account at expo.dev.
2. In `mobile/`, run `npx eas-cli login`, then `npx eas-cli init`. This links the project and writes its id.
3. In `mobile/eas.json`, set `EXPO_PUBLIC_API_URL` to your Render URL.
4. Run `npx eas-cli build -p android --profile preview`. Expo builds it in the cloud and gives you a link and QR code to install the APK.

**When you change the phone app,** run `npm run build:app-web` and commit `public/app` so the web link (option A) updates on the next deploy. It's built ahead of time because building it on a small Render instance can run out of memory.

## 3. Everyday operations

- **Deploys:** every push to the repo's main branch redeploys automatically. Start-up applies new database migrations first.
- **Changing the database schema:** edit `src/db/schema.ts`, run `npx drizzle-kit generate` locally (it asks about renames), commit the new file in `drizzle/`, then push.
- **Logs:** Render → `project-connect` → Logs.
- **Backups:**
  - Render snapshots the disk daily.
  - For an extra copy, download `/var/data/prod.db` from the Render Shell now and then.
- **Custom domain:**
  - Render → `project-connect` → Settings → Custom Domains. Add your domain and follow the DNS steps; HTTPS is automatic.
  - Then set `APP_URL=https://yourdomain.com`.

## 4. Test phase vs. going public

The blueprint starts in **test mode**:
- `ENABLE_MOCK_PAYMENTS=true` means Premium can be tried with simulated payments. The pay page says "TEST MODE".
- No sample profiles are created, so Discover fills up as testers join. To demo with fictional sample profiles instead, add `SEED_SAMPLE_USERS=true` before the first start, and run `npm run db:remove-samples` from the Render Shell before going public.
- `PRIVATE_BETA=true` keeps search engines away.

Before inviting the public, change these:

| Change | How |
|---|---|
| Real payments | Follow `docs/PAYMENTS.md` §3: add the Razorpay keys and webhook, set `BILLING_PROVIDER=razorpay`, rehearse in Razorpay test mode, then **delete** `ENABLE_MOCK_PAYMENTS` |
| Legal pages | Admin → Legal: publish lawyer-reviewed Terms, Privacy, Refund policy and more (two-person publishing) |
| Email/SMS (OTP, password reset) | Add a provider (Resend/SES, MSG91/Twilio with India DLT) — not built yet |
| Photo moderation | Add a moderation API (see `docs/STATUS.md`) |
| Monitoring | Add Sentry, plus uptime checks on `/api/health` |
| Grievance officer | Name one and add their contact details (India IT Rules) |

## 5. Scaling later

When you need more than one server:
- Move the database to Turso (`DATABASE_URL=libsql://…`, `DATABASE_AUTH_TOKEN`) or Postgres.
- Move photos to Cloudflare R2: set `STORAGE_DRIVER=s3` and the `S3_*` variables. Test this driver first; it has never been tested.
- Move rate limiting to Redis or Upstash.
- Then the web service can run several instances without a disk.

## Environment variables

| Variable | Set by | Notes |
|---|---|---|
| `DATABASE_URL` | blueprint | `file:/var/data/prod.db` |
| `UPLOAD_DIR` | blueprint | `/var/data/uploads` |
| `SEED_ADMIN_EMAIL` | you | Used on the first start only |
| `SEED_ADMIN_PASSWORD` | generated | Your first admin password; change it after logging in |
| `AUTH_SECRET` | generated | Signs sessions |
| `FIELD_KEY_SECRET` | generated | Message encryption key; never change |
| `CRON_SECRET` | generated | Protects the scheduled-jobs endpoint |
| `PRIVATE_BETA` | blueprint | `true` = search engines are asked not to index the site; remove when you launch |
| `SEED_SAMPLE_USERS` | optional | `true` before the first start adds ~200 fictional sample profiles so Discover isn't empty while testing; remove them later with `npm run db:remove-samples` |
| `APP_URL` | optional | Your custom domain; defaults to Render's URL |
| `BILLING_PROVIDER`, `ENABLE_MOCK_PAYMENTS` | blueprint | Test mode; see §4 |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | you, later | See `docs/PAYMENTS.md` |
| `DEV_SHOW_OTP` | blueprint | `false`; never `true` in production |
| `PUSH_ENABLED` | later | `true` after the native app has an Expo project id |

## Password-reset emails (Resend)

"Forgot password?" is on the website login and in the app. It emails a one-time link (valid 30 minutes; asking again cancels older links; using it signs out every device).

Emails are only sent once both of these are set in Render → Environment:

- `RESEND_API_KEY` — from resend.com → API Keys.
- `EMAIL_FROM` — e.g. `Project Connect <no-reply@yourdomain.com>`. The domain must be verified in Resend. Resend's shared test sender `onboarding@resend.dev` only delivers to the email that owns the Resend account.

Until then, the request still answers normally but no email goes out (a warning is logged). The Resend sender has not yet been tested against a live account.

## Database backups

Every 6 hours the scheduled job copies the live database (safe while the app runs), compresses and encrypts
it with `BACKUP_KEY`, and stores it. Admin → Settings shows the last backup and has "Back up now".

- **Right now (from the blueprint):** `BACKUP_DRIVER=dir`, `BACKUP_DIR=/var/data/backups`, kept 14 days. This protects
  against a bad change or a mistaken delete, but not against losing the disk.
- **For launch:** set `BACKUP_DRIVER=s3` with the cloud-storage `S3_` settings (optionally `BACKUP_S3_BUCKET` for a
  separate bucket), and `BACKUP_KEEP_DAYS=30`.
- **Copy `BACKUP_KEY` (Render → Environment) somewhere safe offline.** Without it no backup can be opened.

Restore (never touches the live database by itself):

1. `npm run backup:restore -- --list`
2. `npm run backup:restore -- --latest --out ./restored.db` (checks integrity and counts accounts)
3. Suspend the service, move `/var/data/prod.db` aside, copy `restored.db` to `/var/data/prod.db`, resume.

Test a restore on a staging copy at least once a month.

## OTP codes, contacts and the reviewer account

- Email codes use the Resend settings above. SMS codes use MSG91: `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID`
  (a DLT-approved template). Without them no code is sent. Untested against a live MSG91 account.
- Admin → Settings → "Published contacts and Grievance Officer": fill these before launch. They appear on
  /contact, /grievance and in the app. Complaints arrive in Admin → Complaints with their deadlines.
- App Store / Play review account: `npm run reviewer:create -- appreview@yourbrand.in` (Render Shell). It prints a
  new password once; paste it into App Store Connect and Play Console.
