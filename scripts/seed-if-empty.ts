// Server start-up helper: seeds plans, offers, coupons, legal documents, settings and your admin account
// the first time the database is empty. Never touches an existing database.
import "./env";
import { execSync } from "node:child_process";
import { createClient } from "@libsql/client";

async function main() {
  const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  const r = await db.execute("select count(*) as n from plans");
  if (Number(r.rows[0]?.n ?? 0) > 0) { console.log("Database already set up — skipping seed."); return; }
  if (!process.env.SEED_ADMIN_EMAIL) throw new Error("Set SEED_ADMIN_EMAIL (your admin login email) before the first start.");
  console.log("Empty database — creating plans, offers, legal documents and your admin account…");
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit", env: { ...process.env, SEED_DEPLOYED: "true" } });
}
main().catch((e) => { console.error(e); process.exit(1); });
