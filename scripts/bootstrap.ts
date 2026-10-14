// First-boot setup on a deployed server: seed plans, legal placeholders, offers and your admin account
// when the database is empty (and sample people when SEED_SAMPLE_USERS=true). Safe to run on every start.
// Sample photos are drawn afterwards in the background by start.sh (it takes a few minutes).
import "./env";
import { execSync } from "node:child_process";
import { createClient } from "@libsql/client";

async function main() {
  const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  const { rows } = await db.execute("select count(*) as n from plans");
  if (Number(rows[0]?.n ?? 0) > 0) {
    console.log("[bootstrap] database already set up");
    await resetAdminPassword(db);
    return;
  }
  if (!process.env.SEED_ADMIN_EMAIL) {
    // Don't crash-loop the whole site over a missing setting: start, and set up once the email is added.
    console.warn("[bootstrap] ⚠ SEED_ADMIN_EMAIL is not set — skipping first-time setup (plans, offers, legal pages, admin account).");
    console.warn("[bootstrap] ⚠ Add SEED_ADMIN_EMAIL in Render → Environment; setup runs automatically on the next start.");
    return;
  }
  console.log("[bootstrap] empty database — seeding");
  const env = { ...process.env, SEED_DEPLOYED: "true" };
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit", env });
  execSync("npx tsx scripts/rotate-keys.ts", { stdio: "inherit", env });
}
/**
 * Admin password reset: set ADMIN_RESET_PASSWORD (12+ characters, your choice) in the host's environment
 * and restart. The admin account for SEED_ADMIN_EMAIL gets that password (created as Super Admin if it
 * doesn't exist), lockouts are cleared and old sessions signed out. Remove the variable afterwards.
 */
async function resetAdminPassword(db: ReturnType<typeof createClient>) {
  const pw = process.env.ADMIN_RESET_PASSWORD;
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!pw) return;
  if (!email) { console.warn("[bootstrap] ⚠ ADMIN_RESET_PASSWORD is set but SEED_ADMIN_EMAIL is not — nothing reset."); return; }
  if (pw.length < 12) { console.warn("[bootstrap] ⚠ ADMIN_RESET_PASSWORD must be at least 12 characters — nothing reset."); return; }
  const argon2 = await import("@node-rs/argon2");
  const hash = await argon2.hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const existing = await db.execute({ sql: "select id from users where email = ?", args: [email] });
  if (existing.rows.length) {
    await db.execute({ sql: "update users set password_hash = ?, failed_logins = 0, locked_until = null, token_version = token_version + 1, totp_secret = null, status = 'ACTIVE' where email = ?", args: [hash, email] });
    console.log(`[bootstrap] ✓ Admin password reset for ${email}. Remove ADMIN_RESET_PASSWORD from the environment now.`);
  } else {
    await db.execute({ sql: "insert into users (id, email, password_hash, role, status, email_verified, onboarding_step, created_at, last_active_at, token_version, failed_logins, risk_level) values (?, ?, ?, 'SUPER_ADMIN', 'ACTIVE', 1, 3, ?, ?, 0, 0, 'LOW')", args: [crypto.randomUUID(), email, hash, Date.now(), Date.now()] });
    console.log(`[bootstrap] ✓ Admin account created for ${email}. Remove ADMIN_RESET_PASSWORD from the environment now.`);
  }
}

main().catch((e) => { console.error("[bootstrap] failed:", e); process.exit(1); });
