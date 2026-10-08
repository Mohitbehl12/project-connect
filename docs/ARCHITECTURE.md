# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| App + API | Next.js 15 (App Router), TypeScript | One deployable for web, API and admin; serverless-friendly |
| Database | SQLite via libSQL (local file in dev, **Turso** in production) with Drizzle ORM | Free tier, zero ops; Drizzle schema ports to Postgres by swapping `sqlite-core` → `pg-core` |
| Auth | Email + password (bcrypt, cost 12), HS256 JWT in an httpOnly cookie, `tokenVersion` revocation | No external auth dependency; bans and "log out everywhere" revoke instantly |
| Validation | Zod on every request body | Single source of truth for input rules |
| Styling | Tailwind with project tokens (`tailwind.config.ts`) | Original palette: indigo ink, lavender paper, marigold, sage, rose |
| Tests | Vitest (unit), custom fetch-based E2E runner | E2E can target any deployment via `BASE_URL` |

## Folder layout

```
src/
  db/            schema.ts (all tables), index.ts (client)
  lib/           server logic: auth, http (route wrapper), rbac, matching (pure), moderation (pure),
                 people (public card shaping), matches, config, legal, otp, notify, audit, ratelimit
  app/api/       REST endpoints (one folder per resource)
  app/…          pages: public, member app, /admin
  components/    UI kit, shells, profile view, forms, dialogs
scripts/         seed, reset
tests/           unit/ and e2e.ts
```

## Data model

`users` (credentials, role, status, verification flags, plan) · `profiles` (public profile + **private** lat/lng) · `preferences` (who to see + privacy + notification toggles) · `personality_answers` · `likes` (LIKE / PASS / PRIORITY, unique per pair) · `matches` (ordered pair, score, reasons, status) · `messages` (moderation flags, soft delete) · `date_plans` · `blocks` · `reports` (member or automated, priority) · `moderation_actions` · `audit_logs` · `notifications` · `otp_codes` (hashed) · `plans` / `plan_prices` (per country) / `subscriptions` · `legal_documents` / `legal_versions` / `legal_acceptances` · `app_config` (JSON settings such as matching weights).

Indexes cover discovery (`country, gender, dob`), inbox (`match_id, created_at`), report queue (`status, priority, created_at`) and all pair lookups.

## Matching engine (`src/lib/matching.ts`)

Pure functions, unit-tested.

1. **Hard filters (both directions):** gender preference, age range, distance (unless both allow long distance), intent filter. Blocked, already-seen, inactive, hidden and incognito profiles are excluded in SQL.
2. **Score** = weighted average of seven 0–1 factors: intent affinity (a symmetric table, so "long-term" and "marriage-minded" are close), shared interests, personality closeness (10 questions on a 1–5 scale), lifestyle (ordinal for drinking/smoking/exercise; food and pets have custom closeness), distance, age fit, and profile quality + verification. Weights live in `app_config` and are editable in Admin → Settings.
3. **Display:** mapped to a 40–99 band (never 100%) with up to five plain-language reasons. Internal factor values are never sent to clients.
4. **Never used:** photos, religion, caste, ethnicity or any protected attribute.

Discovery modes re-sort the same eligible set: best fit, personality, shared interests, same goals, nearby.

**Scaling path:** the current version pre-filters in SQL and scores up to 1,000 candidates in memory per request, which is fine to tens of thousands of users. Beyond that: Postgres + PostGIS `ST_DWithin`, a nightly candidate table, and cached scores.

## API

All under `/api`. Every route goes through `route()` in `lib/http.ts`, which checks the session, account status and permission, and returns uniform errors (`{ error, code }`) with correct status codes.

| Area | Endpoints |
|---|---|
| Auth | `POST auth/register`, `POST auth/login`, `POST auth/logout`, `POST auth/otp` (send/verify, EMAIL/PHONE) |
| Me | `GET me`, `DELETE me` (account deletion, password required) |
| Profile | `PUT profile`, `PUT preferences`, `PUT personality`, `POST verification` |
| Discovery | `GET discovery?mode=` |
| Likes | `POST likes`, `GET likes` (who liked me; gated by plan) |
| Matches & chat | `GET matches`, `GET matches/:id`, `GET/POST matches/:id/messages`, `DELETE messages/:id`, `POST matches/:id/unmatch` |
| Dates | `POST matches/:id/dates`, `PATCH dates/:id` (confirm/cancel/reschedule) |
| Safety | `POST/GET reports`, `POST/GET/DELETE blocks` |
| Notifications | `GET notifications`, `POST notifications` (mark all read) |
| Billing | `GET plans`, `POST subscriptions` (subscribe/cancel) |
| Legal | `GET legal/:slug`, `POST legal/accept` |
| Admin | `GET admin/stats`, `GET admin/users`, `GET/POST admin/users/:id`, `GET admin/reports`, `GET/POST admin/reports/:id`, `GET admin/matches`, `GET admin/audit`, `GET/PUT admin/config`, `GET/POST admin/legal`, `POST admin/legal/:versionId` |

## Roles and permissions (`src/lib/rbac.ts`)

| Role | Can |
|---|---|
| Support | View users and reports |
| Moderator | + moderate (warn/suspend/restore), verify, resolve reports, read reported conversations |
| Admin | + ban, analytics, config, plans, legal drafts, audit log |
| Super Admin | everything, including role assignment and publishing legal versions |

Staff accounts can only be acted on by someone with `roles.assign`.

## Security and privacy controls

- Passwords: bcrypt (12 rounds), minimum strength rule, account lockout after 5 failures (15 min), per-IP and per-email rate limits; constant-time dummy compare for unknown emails.
- Sessions: httpOnly, SameSite=Lax, Secure in production; `tokenVersion` revokes on ban/role change.
- Authorization: server-side on every route; never trusts the client. Strangers get 404 for other people's conversations.
- Input: Zod everywhere; Drizzle parameterises all SQL; legal Markdown is rendered through a whitelist renderer (no raw HTML).
- Headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; `x-powered-by` removed.
- Data minimisation: other members see first name, age, city, a **rounded** distance label and profile content. Email, phone, DOB, coordinates, internal IDs beyond the profile key, plan and flags never leave the server. Locations are city centres plus a fixed per-user jitter; device GPS is never collected. Admins see city, not coordinates; phone numbers are masked for Support/Moderator.
- Profile text and like notes reject phone numbers, emails, links and other-app handles.
- OTPs are stored as SHA-256 hashes, expire in 10 minutes and lock after 5 wrong attempts.
- Evidence access (reading a reported conversation) is written to the audit log.
- Legal acceptances are tied to the exact version accepted; published versions are immutable.

**Known gaps:** see `docs/STATUS.md` (CSRF relies on SameSite=Lax plus JSON-only bodies; the rate limiter is in-memory per instance).
