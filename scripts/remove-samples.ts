// Deletes the fictional sample people (emails ending @test.local / @demo.local) and their photos.
// Run before a public launch: npm run db:remove-samples
import "./env";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { inArray, like, or } from "drizzle-orm";
import { rm } from "node:fs/promises";
import path from "node:path";
import * as s from "../src/db/schema";

const db = drizzle(createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN || undefined }), { schema: s });
const ROOT = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve("data", "uploads");

async function main() {
  const rows = await db.select({ id: s.users.id }).from(s.users).where(or(like(s.users.email, "%@test.local"), like(s.users.email, "%@demo.local")));
  const ids = rows.map((r) => r.id);
  for (const id of ids) await rm(path.join(ROOT, "photos", id), { recursive: true, force: true });
  for (let i = 0; i < ids.length; i += 200) await db.delete(s.users).where(inArray(s.users.id, ids.slice(i, i + 200)));
  console.log(`Removed ${ids.length} sample people and their photos.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
