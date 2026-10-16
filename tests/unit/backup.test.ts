import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { backupKeyName, backupTarget, openBackup, sealBackup } from "../../src/lib/backupCore";

const dir = mkdtempSync(path.join(tmpdir(), "pc-bk-"));

async function sampleDb() {
  const file = path.join(dir, `src-${Math.random().toString(36).slice(2)}.db`);
  const c = createClient({ url: `file:${file}` });
  await c.execute("create table users (id text primary key, email text)");
  await c.execute("insert into users values ('u1', 'a@example.com'), ('u2', 'b@example.com')");
  c.close();
  return readFileSync(file);
}

describe("database backups", () => {
  it("encrypts and restores a database exactly", async () => {
    const raw = await sampleDb();
    const blob = sealBackup(raw, "a-long-backup-key-123");
    expect(blob.includes(Buffer.from("a@example.com"))).toBe(false); // nothing readable in the file
    expect(openBackup(blob, "a-long-backup-key-123").equals(raw)).toBe(true);
  });
  it("refuses the wrong key and damaged files", async () => {
    const blob = sealBackup(await sampleDb(), "a-long-backup-key-123");
    expect(() => openBackup(blob, "some-other-key-4567")).toThrow(/wrong BACKUP_KEY/);
    const bad = Buffer.from(blob); bad[bad.length - 5] ^= 0xff;
    expect(() => openBackup(bad, "a-long-backup-key-123")).toThrow();
    expect(() => sealBackup(Buffer.from("x"), "short")).toThrow(/at least 16/);
  });
  it("stores, lists newest first and reads back from a folder target", async () => {
    process.env.BACKUP_KEY = "a-long-backup-key-123"; process.env.BACKUP_DRIVER = "dir"; process.env.BACKUP_DIR = path.join(dir, "store");
    const t = backupTarget()!;
    const k1 = backupKeyName(new Date("2026-10-01T00:00:00Z")), k2 = backupKeyName(new Date("2026-10-02T00:00:00Z"));
    await t.put(k1, Buffer.from("one")); await new Promise((r) => setTimeout(r, 20)); await t.put(k2, Buffer.from("two"));
    const list = await t.list();
    expect(list.map((o) => o.key)).toEqual([k2, k1]);
    expect((await t.get(list[0].key)).toString()).toBe("two");
  });
  it("is off unless a key and a place are configured", () => {
    delete process.env.BACKUP_KEY;
    expect(backupTarget()).toBeNull();
  });
});
