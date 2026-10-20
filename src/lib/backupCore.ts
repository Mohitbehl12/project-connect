// Backup files and where they're kept. No database access here, so the restore script can use it too.
// File format: "PCBK1" + 12-byte IV + 16-byte auth tag + AES-256-GCM(gzip(SQLite file)).
// The key is BACKUP_KEY. Keep a copy of it somewhere safe and offline: without it no backup can be read.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const MAGIC = Buffer.from("PCBK1");
const keyOf = (secret: string) => {
  if (!secret || secret.length < 16) throw new Error("BACKUP_KEY must be at least 16 characters.");
  return createHash("sha256").update(`pc-backup:${secret}`).digest();
};

export function sealBackup(dbFile: Buffer, secret: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const body = Buffer.concat([c.update(gzipSync(dbFile, { level: 9 })), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

export function openBackup(blob: Buffer, secret: string): Buffer {
  if (!blob.subarray(0, 5).equals(MAGIC)) throw new Error("Not a Kinara backup file.");
  const d = createDecipheriv("aes-256-gcm", keyOf(secret), blob.subarray(5, 17));
  d.setAuthTag(blob.subarray(17, 33));
  let plain: Buffer;
  try { plain = Buffer.concat([d.update(blob.subarray(33)), d.final()]); }
  catch { throw new Error("This backup can't be opened: wrong BACKUP_KEY, or the file is damaged."); }
  const db = gunzipSync(plain);
  if (!db.subarray(0, 16).toString("latin1").startsWith("SQLite format 3")) throw new Error("The backup doesn't contain a database.");
  return db;
}

export type BackupObject = { key: string; size: number; at: Date };
export interface BackupTarget {
  name: string;
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  list(): Promise<BackupObject[]>; // newest first
  remove(key: string): Promise<void>;
}

const PREFIX = "backups/";

class S3Target implements BackupTarget {
  name = "cloud storage";
  private bucket = process.env.BACKUP_S3_BUCKET || process.env.S3_BUCKET || "";
  private client = (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region: process.env.S3_REGION ?? "auto", endpoint: process.env.S3_ENDPOINT,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
    });
  })();
  async put(key: string, body: Buffer) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.client).send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: "application/octet-stream" }));
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const r = await (await this.client).send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async list() {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const out: BackupObject[] = [];
    let token: string | undefined;
    do {
      const r = await (await this.client).send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: PREFIX, ContinuationToken: token }));
      for (const o of r.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, at: o.LastModified ?? new Date(0) });
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out.sort((a, b) => b.at.getTime() - a.at.getTime());
  }
  async remove(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.client).send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** A folder. Only for testing, or as a stopgap: a folder on the same disk doesn't survive losing the disk. */
class DirTarget implements BackupTarget {
  name = "a local folder";
  constructor(private dir: string) {}
  private p = (key: string) => path.join(this.dir, key.replace(/^backups\//, "").replace(/[\\/]/g, "_"));
  async put(key: string, body: Buffer) { mkdirSync(this.dir, { recursive: true }); writeFileSync(this.p(key), body); }
  async get(key: string) { return readFileSync(this.p(key)); }
  async list() {
    try {
      return readdirSync(this.dir).filter((f) => f.endsWith(".pcbk")).map((f) => {
        const st = statSync(path.join(this.dir, f));
        return { key: PREFIX + f, size: st.size, at: st.mtime };
      }).sort((a, b) => b.at.getTime() - a.at.getTime());
    } catch { return []; }
  }
  async remove(key: string) { unlinkSync(this.p(key)); }
}

/** BACKUP_DRIVER=s3 (uses the S3_ settings; BACKUP_S3_BUCKET to use a separate bucket) or dir (BACKUP_DIR). */
export function backupTarget(): BackupTarget | null {
  if (!process.env.BACKUP_KEY) return null;
  if (process.env.BACKUP_DRIVER === "s3" && (process.env.BACKUP_S3_BUCKET || process.env.S3_BUCKET) && process.env.S3_ACCESS_KEY_ID) return new S3Target();
  if (process.env.BACKUP_DRIVER === "dir" && process.env.BACKUP_DIR) return new DirTarget(process.env.BACKUP_DIR);
  return null;
}

export const backupKeyName = (d: Date) => `${PREFIX}pc-${d.toISOString().replace(/[:.]/g, "-")}.pcbk`;
