import "server-only";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { backupKeyName, backupTarget, sealBackup } from "./backupCore";
import { getConfig, setConfig } from "./config";

const HOUR = 3_600_000;

/**
 * Takes a consistent copy of the live database (SQLite VACUUM INTO, safe while the app runs), encrypts it,
 * uploads it, and keeps the last BACKUP_KEEP_DAYS days (always at least 3 backups).
 */
export async function runBackup(now = new Date()) {
  const target = backupTarget();
  if (!target) return { ran: false as const, reason: "Backups aren't set up (BACKUP_KEY and BACKUP_DRIVER)." };
  const dir = mkdtempSync(path.join(tmpdir(), "pc-backup-"));
  const file = path.join(dir, "snapshot.db");
  try {
    await db.run(sql.raw(`VACUUM INTO '${file.replace(/'/g, "''")}'`));
    const blob = sealBackup(readFileSync(file), process.env.BACKUP_KEY!);
    const key = backupKeyName(now);
    await target.put(key, blob);
    // Retention: drop backups older than the window, but never the newest three.
    const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 30);
    const all = await target.list();
    let removed = 0;
    for (const o of all.slice(3)) if (o.at.getTime() < now.getTime() - keepDays * 24 * HOUR) { await target.remove(o.key); removed++; }
    await setConfig("ops.lastBackup", { at: now.toISOString(), key, bytes: blob.length, error: null }, "system");
    return { ran: true as const, key, bytes: blob.length, removed, where: target.name };
  } catch (e) {
    const error = String((e as Error).message ?? e).slice(0, 300);
    await setConfig("ops.lastBackup", { ...(await getConfig("ops.lastBackup")), error, failedAt: now.toISOString() }, "system");
    console.error("[backup] failed:", error);
    return { ran: false as const, reason: error };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Called by the scheduled job: backs up when the last good backup is older than BACKUP_EVERY_HOURS (default 6). */
export async function maybeBackup(now = new Date()) {
  if (!backupTarget()) return { ran: false as const, reason: "not configured" };
  const last = await getConfig("ops.lastBackup");
  const every = Number(process.env.BACKUP_EVERY_HOURS ?? 6) * HOUR;
  if (last.at && now.getTime() - Date.parse(last.at) < every) return { ran: false as const, reason: "not due" };
  return runBackup(now);
}

export async function backupStatus() {
  const target = backupTarget();
  const last = await getConfig("ops.lastBackup");
  const recent = target ? (await target.list().catch(() => [])).slice(0, 10) : [];
  return { configured: !!target, where: target?.name ?? null, everyHours: Number(process.env.BACKUP_EVERY_HOURS ?? 6), keepDays: Number(process.env.BACKUP_KEEP_DAYS ?? 30), last, recent };
}
