#!/bin/sh
# Production start (Render or any single server with a persistent disk).
# 1) make sure the data folder exists  2) apply the database schema  3) seed once on an empty database
# 4) run the scheduled jobs every 30 minutes in the background  5) start the server.
set -e
DATA_DIR="${DATA_DIR:-/var/data}"
mkdir -p "$DATA_DIR" "${UPLOAD_DIR:-$DATA_DIR/uploads}"
export DATABASE_URL="${DATABASE_URL:-file:$DATA_DIR/app.db}"

npx drizzle-kit push --force
npx tsx scripts/bootstrap.ts

PORT="${PORT:-3000}"
if [ "$SEED_SAMPLE_USERS" = "true" ]; then
  # Draws placeholder photos for sample people that don't have any yet (skips the rest). Runs after start-up.
  ( sleep 20; nice -n 10 npx tsx scripts/seed-photos.ts || true ) &
fi
if [ -n "$CRON_SECRET" ]; then
  ( sleep 90; while true; do
      curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "http://127.0.0.1:$PORT/api/cron/billing" >/dev/null 2>&1 || true
      sleep 1800
    done ) &
fi
exec npx next start -p "$PORT"
