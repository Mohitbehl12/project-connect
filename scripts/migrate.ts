// Applies the SQL migrations in ./drizzle (non-interactive — safe for server start-up).
// After changing src/db/schema.ts, run `npx drizzle-kit generate` locally and commit the new migration.
import "./env";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";

async function main() {
  const url = process.env.DATABASE_URL!;
  if (url.startsWith("file:")) mkdirSync(path.dirname(url.slice(5)), { recursive: true });
  const db = drizzle(createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined }));
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Database migrations applied.");
}
main().catch((e) => { console.error(e); process.exit(1); });
