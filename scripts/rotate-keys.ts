// Re-encrypts stored fields with the active key (FIELD_KEY_ACTIVE) and encrypts any plain legacy messages.
// Run after adding a new key: npm run keys:rotate. Safe to re-run; processes in batches.
import "./env";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, ne } from "drizzle-orm";
import * as s from "../src/db/schema";
import { keyIdOf, keyring, open, seal } from "../src/lib/crypto";

const db = drizzle(createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN || undefined }), { schema: s });

async function main() {
  const active = keyring().active;
  let msgs = 0, secrets = 0;
  const rows = await db.select({ id: s.messages.id, matchId: s.messages.matchId, body: s.messages.body }).from(s.messages).where(ne(s.messages.body, ""));
  for (const m of rows) {
    if (keyIdOf(m.body) === active) continue;
    await db.update(s.messages).set({ body: seal(open(m.body, m.matchId), m.matchId) }).where(eq(s.messages.id, m.id));
    msgs++;
  }
  const users = await db.select({ id: s.users.id, totp: s.users.totpSecret }).from(s.users);
  for (const u of users) {
    if (!u.totp || keyIdOf(u.totp) === active) continue;
    await db.update(s.users).set({ totpSecret: seal(open(u.totp)) }).where(eq(s.users.id, u.id));
    secrets++;
  }
  console.log(`Re-encrypted ${msgs} messages and ${secrets} 2-step secrets with key ${active}.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
