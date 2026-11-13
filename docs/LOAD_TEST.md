# Load test

`tests/load.ts` signs a number of sample members in and has them use the app for a set time, then prints
latency percentiles per endpoint and fails if any p95 is over 1.5 seconds or more than 1% of requests fail.
It has no dependencies.

## How to run it

Never point it at the real database. It signs in as seeded sample people and sends requests continuously.

```bash
# 1. A throwaway database with many sample people (about two minutes for 20,000)
DATABASE_URL=file:./data/load.db npx tsx scripts/migrate.ts
DATABASE_URL=file:./data/load.db SEED_SAMPLE_COUNT=20000 npm run db:seed

# 2. A production build against it
DATABASE_URL=file:./data/load.db npx next build
DATABASE_URL=file:./data/load.db npx next start -p 3000

# 3. The test (settings are listed at the top of tests/load.ts)
LOAD_USERS=100 LOAD_SECONDS=60 npm run test:load
```

To test a staging server you own, set `LOAD_BASE=https://…` and `LOAD_ALLOW_REMOTE=true`. The script refuses
any non-local address without that flag. The staging server must have the sample people seeded, and it must
trust the `x-forwarded-for` header the script sends, or every virtual member shares one rate limit.

## What it does

- **Sign-in rush:** all members sign in, ten at a time.
- **Steady use:** each member makes a request about every five seconds: 25% Discover (a fifth of those in
  Nearby mode), 25% the matches list, 10% their own account, 15% notifications, and the rest likes and chat.
  Sample people have no matches of their own, so chat reads and sends are not exercised until the seed gives
  them some.

Not covered: photo upload, the long-poll chat wait, calls, payments, and anything in the admin.

## First results (13 November 2026)

Run on a 2-CPU, 7 GB sandbox, not on Render. Database: SQLite file with 20,008 people, about 4,700 of them
in Delhi. Code: `main` plus the three open fixes (#20, #21, #22). These numbers show how the code behaves as
load rises on one small machine. They do not predict the production server.

| Members online | Requests per second | Discover p50 | Discover p95 | Worst p95 (any endpoint) | Errors | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 3.8 | 128 ms | 164 ms | 182 ms | 0% | Pass |
| 100 | 21.6 | 135 ms | 397 ms | 668 ms | 0% | Pass |
| 200 | 37.4 | 730 ms | 3,362 ms | 4,370 ms | 0% | Fail (slow) |
| 400 | 49.7 | 879 ms | over 15 s | over 15 s | 25% timeouts | Fail |

The single-member row used a 200 ms pause between requests; the others used the default.

### What limits it

One Discover request costs about 130 ms of processor time, and it blocks everything else while it runs.

- A CPU profile of `discover()` shows most of that time inside the database client's synchronous calls,
  reading up to 1,000 candidate rows with every column of three tables.
- The server is one Node process, so it can complete roughly seven or eight Discover requests a second.
  Past that, every other endpoint queues behind them, which is why the matches list and notifications slow
  down together even though each takes about 10 ms alone.
- Sign-in is not the limit: 400 members signed in with a p95 under one second.

### What would raise the ceiling, cheapest first

1. Select only the columns scoring needs for the candidate rows.
2. Cache a member's scored candidates for a short time, cleared when they like or pass.
3. Move the database to a shared libSQL service, so queries stop blocking the Node process.
4. Run a second server (needs Redis, already supported).

None of these is needed for a beta of a few hundred people. Rerun this test on the real server size before
inviting more than about a hundred people at once.
