// Restores a database backup to a file. It never touches the live database by itself.
//
//   npm run backup:restore -- --list
//   npm run backup:restore -- --latest --out ./restored.db
//   npm run backup:restore -- --key backups/pc-2026-10-16T06-00-00-000Z.pcbk --out ./restored.db
//
// Needs the same BACKUP_KEY and BACKUP_DRIVER settings as the server. To put a restore live: stop the service,
// move the current database aside, copy the restored file to DATABASE_URL's path, start the service.
import "./env";
import { existsSync, writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { backupTarget, openBackup } from "../src/lib/backupCore";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const value = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

async function main() {
  const target = backupTarget();
  if (!target) throw new Error("Backups aren't set up here: set BACKUP_KEY and BACKUP_DRIVER (plus S3_ or BACKUP_DIR settings).");
  const list = await target.list();
  if (flag("--list")) {
    if (!list.length) console.log("No backups found.");
    for (const o of list) console.log(`${o.at.toISOString()}  ${(o.size / 1024).toFixed(0).padStart(7)} KB  ${o.key}`);
    return;
  }
  const key = value("--key") ?? (flag("--latest") ? list[0]?.key : undefined);
  if (!key) throw new Error("Say which backup: --latest, or --key <name> (see --list).");
  const out = value("--out") ?? "./restored.db";
  if (existsSync(out) && !flag("--force")) throw new Error(`${out} already exists. Choose another --out, or add --force to replace it.`);
  const dbFile = openBackup(await target.get(key), process.env.BACKUP_KEY!);
  writeFileSync(out, dbFile);
  // Prove it opens and looks like ours.
  const c = createClient({ url: `file:${out}` });
  const users = await c.execute("select count(*) as n from users");
  const check = await c.execute("pragma integrity_check");
  c.close();
  console.log(`✓ Restored ${key} → ${out}`);
  console.log(`  integrity: ${check.rows[0]?.integrity_check ?? check.rows[0]?.[0]}, accounts: ${users.rows[0]?.n}`);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
