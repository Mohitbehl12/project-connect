# Deployment (free tier test environment)

Recommended: **Vercel** (app + API, free HTTPS) + **Turso** (libSQL database, free tier). Both have free plans suitable for a test environment; check their current limits before relying on them.

## 1. Database on Turso

```bash
# install the CLI: https://docs.turso.tech
turso auth signup
turso db create project-connect                    # choose a region near your users (see turso docs)
turso db show project-connect --url                # → libsql://project-connect-<you>.turso.io
turso db tokens create project-connect             # → auth token
```

Create the tables and seed from your machine:

```bash
DATABASE_URL="libsql://…" DATABASE_AUTH_TOKEN="…" npx drizzle-kit push --force
DATABASE_URL="libsql://…" DATABASE_AUTH_TOKEN="…" SEED_ADMIN_PASSWORD="<strong password>" npm run db:seed
```

Skip the seed (or delete the test users) for anything real-user-facing.

## 2. App on Vercel

1. Push the repository to GitHub (`.env` and `data/` are git-ignored — never commit them).
2. In Vercel: **Add New → Project → import the repo**. Framework is detected as Next.js.
3. Set environment variables (Production and Preview):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `libsql://…turso.io` |
| `DATABASE_AUTH_TOKEN` | Turso token |
| `AUTH_SECRET` | `openssl rand -base64 48` — unique per environment |
| `DEV_SHOW_OTP` | `true` only while OTP delivery is mocked; `false` once SMS/email is wired |
| `ENABLE_MOCK_PAYMENTS` | `true` for the test environment only |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | only needed when seeding |

4. Deploy. Vercel provides HTTPS on `*.vercel.app`; add a custom domain later.
5. Verify: `BASE_URL=https://<your-app>.vercel.app npm run test:e2e` (creates two test accounts).

## Monitoring and logs

- Vercel → Project → Logs shows API errors (`[api] unhandled error` lines).
- Add Sentry (free developer tier) with `npx @sentry/wizard@latest -i nextjs` for error alerts.
- Admin → Audit log covers security-relevant events.

## Environment variable reference

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `file:./data/dev.db` locally |
| `DATABASE_AUTH_TOKEN` | prod | Turso token |
| `AUTH_SECRET` | yes | ≥32 chars; rotating it logs everyone out |
| `DEV_SHOW_OTP` | no | Returns OTP codes in API responses — test only |
| `ENABLE_MOCK_PAYMENTS` | no | Allows mock checkout in production builds — test only |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | seed only | Change the default password before any shared deploy |

## Before real users

Work through the launch checklist in `docs/STATUS.md`.
