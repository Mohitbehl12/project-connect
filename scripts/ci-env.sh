#!/bin/sh
# Writes a throwaway .env for CI: fresh random test secrets, local SQLite, mock payments. Never real keys.
# No Razorpay key id/secret: with them set, advertiser top-ups call the real Razorpay API, which can't work from CI.
# The webhook secret stays so the signed-webhook checks still run.
set -e
r() { node -e "process.stdout.write(require('crypto').randomBytes($1).toString('$2'))"; }
cat > .env <<EOF
DATABASE_URL="file:./data/ci.db"
AUTH_SECRET="$(r 48 base64)"
DEV_SHOW_OTP="true"
SEED_ADMIN_EMAIL="admin@projectconnect.local"
SEED_ADMIN_PASSWORD="ChangeMe!2026"
ENABLE_MOCK_PAYMENTS="true"
PUSH_ENABLED="false"
STORAGE_DRIVER="local"
APP_URL="http://localhost:3000"
BILLING_PROVIDER="mock"
RAZORPAY_WEBHOOK_SECRET="$(r 24 hex)"
CRON_SECRET="$(r 24 hex)"
FIELD_KEYS="v1:$(r 32 base64)"
FIELD_KEY_ACTIVE="v1"
STORE_BILLING_ENABLED="true"
BACKUP_KEY="$(r 32 base64)"
BACKUP_DRIVER="dir"
BACKUP_DIR="./data/backups"
CALLS_ALLOW_DIRECT=true
EOF
mkdir -p data
# A local stand-in for the browsers' push service (the e2e suite checks Web Push end to end against it).
mkdir -p .ci && openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" -keyout .ci/key.pem -out .ci/cert.pem 2>/dev/null
echo "CI environment ready."
