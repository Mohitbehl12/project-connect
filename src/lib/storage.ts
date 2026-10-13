import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Object storage behind one small interface.
 * - "local" (default): files under data/uploads, served by /api/media with short-lived signed links. For dev and tests.
 * - "s3": any S3-compatible bucket — Cloudflare R2, AWS S3, Backblaze B2 — via pre-signed GET links.
 *   Set STORAGE_DRIVER=s3, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (S3_REGION defaults to "auto").
 *   NOTE: the s3 driver is written against the AWS SDK but has not been exercised against a live bucket yet.
 */
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /** A link that works for `ttlSeconds`; relative for the local driver, absolute for s3. */
  url(key: string, ttlSeconds?: number): Promise<string>;
}

const SAFE_KEY = /^[a-zA-Z0-9/_.-]+$/;
function assertKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error("invalid storage key");
}

function sign(key: string, exp: number) {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`${key}:${exp}`).digest("base64url");
}

export function verifyMediaSignature(key: string, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = Buffer.from(sign(key, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

class LocalStorage implements Storage {
  root = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve(process.cwd(), "data", "uploads");
  private file(key: string) {
    assertKey(key);
    return path.join(this.root, key);
  }
  async put(key: string, body: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }
  async get(key: string) {
    try { return await readFile(this.file(key)); } catch { return null; }
  }
  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
  async url(key: string, ttl = 3600) {
    assertKey(key);
    // Round expiry to the hour so the same image keeps the same URL for a while (better client caching).
    const exp = Math.ceil((Date.now() / 1000 + ttl) / 3600) * 3600;
    return `/api/media/${key}?exp=${exp}&sig=${sign(key, exp)}`;
  }
}

class S3Storage implements Storage {
  private clientPromise = (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
    });
  })();
  private bucket = process.env.S3_BUCKET ?? "";
  async put(key: string, body: Buffer, contentType: string) {
    assertKey(key);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.clientPromise).send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: "private, max-age=86400" }));
  }
  async get(key: string) {
    assertKey(key);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const r = await (await this.clientPromise).send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    } catch { return null; }
  }
  async delete(key: string) {
    assertKey(key);
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.clientPromise).send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async url(key: string, ttl = 3600) {
    assertKey(key);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(await this.clientPromise, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttl });
  }
}

let instance: Storage | null = null;
export function storage(): Storage {
  if (!instance) instance = process.env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
  return instance;
}
