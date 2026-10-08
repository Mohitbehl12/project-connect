# Project Connect

An original dating platform built around **intent, explained compatibility and safety**. Working name — the brand lives in a handful of strings and Tailwind tokens, so it can be renamed later.

Web app (responsive: phone, tablet, desktop) + REST API + admin panel, in one Next.js codebase.

## Quick start

Requires Node 20+.

```bash
npm install
cp .env.example .env            # then set AUTH_SECRET: openssl rand -base64 48
npm run db:reset                # creates the SQLite DB and seeds ~200 test users
npm run dev                     # http://localhost:3000
```

Test logins (seeded):

| Who | Email | Password |
|---|---|---|
| Member | aanya@demo.local / rohan@demo.local | `Demo!2026` |
| Super admin | admin@projectconnect.local | value of `SEED_ADMIN_PASSWORD` |
| Moderator | moderator@projectconnect.local | same as admin |
| Support | support@projectconnect.local | same as admin |

All ~200 other seeded members are `user1@test.local` … `user200@test.local` with `Demo!2026`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build && npm start` | Production build and server |
| `npm run db:push` | Apply schema changes to the database |
| `npm run db:seed` | Seed an empty database |
| `npm run db:reset` | Wipe the **local** DB file, recreate, seed (refuses remote DBs) |
| `npm test` | Unit tests (matching engine, moderation, starters) |
| `npm run test:e2e` | 96-check API journey against a running server (`BASE_URL=…` to target a deployment) |
| `npm run typecheck` | TypeScript check |

## What's built

**Members:** register (18+ gate, legal acceptance recorded per document version), login with lockout, email + phone OTP, profile with prompts/interests/lifestyle, preferences, 10-question personality, selfie verification request, discovery in 5 modes with an explained compatibility score, like / pass / priority like with a note, mutual matching, chat with conversation starters, read receipts, message delete, unanswered-message cap, automated scam/abuse screening with in-chat warnings, date planner (public places only, confirm/cancel/reschedule), report / block / unmatch, notifications, privacy and notification controls, plans and subscriptions, account deletion, Safety Center.

**Staff:** dashboard with KPIs and 14-day trends, user search and detail, moderation actions (warn/suspend/ban/restore/verify/role/revoke sessions), verification queue, prioritised report queue with conversation evidence, match list, audit log, matching-weight and limit configuration, per-country plan pricing, legal centre with draft → review → publish versioning and four-eyes publishing. Role-based permissions for Support, Moderator, Admin, Super Admin.

## What is mocked or not built yet

Read `docs/STATUS.md` before launch — it lists every mocked integration and what's needed to make it real (OTP delivery, selfie liveness, payments, photo upload, push, realtime transport, Google/Apple sign-in).

## Docs

- `docs/ARCHITECTURE.md` — stack, structure, data model, matching engine, API, security
- `docs/DEPLOYMENT.md` — free-tier deployment (Vercel + Turso), env vars
- `docs/STATUS.md` — testing report, mocked features, known gaps, next phases
- `docs/ADMIN_GUIDE.md` — how staff use the panel
