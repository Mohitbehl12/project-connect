import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";

// Load .env for CLI usage (Next.js loads it automatically at runtime)
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: process.env.DATABASE_URL?.startsWith("libsql://") ? "turso" : "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/dev.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  } as { url: string },
});
