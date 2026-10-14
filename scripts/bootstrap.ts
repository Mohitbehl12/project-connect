// First-boot setup on a deployed server: seed plans, legal placeholders, offers and your admin account
// when the database is empty (and sample people when SEED_SAMPLE_USERS=true). Safe to run on every start.
// Sample photos are drawn afterwards in the background by start.sh (it takes a few minutes).
import "./env";
import { execSync } from "node:child_process";
import { createClient } from "@libsql/client";

async function main() {
  const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  const { rows } = await db.execute("select count(*) as n from plans");
  if (Number(rows[0]?.n ?? 0) > 0) { console.log("[bootstrap] database already set up"); return; }
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
main().catch((e) => { console.error("[bootstrap] failed:", e); process.exit(1); });
