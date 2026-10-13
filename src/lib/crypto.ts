// Pure Node crypto helpers (no server-only marker so scripts such as keys:rotate can use them; never import from client code).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Field encryption at rest: AES-256-GCM (authenticated), a fresh 96-bit IV per value, versioned keys.
// Stored form:  enc:<keyId>:<iv b64url>:<tag b64url>:<ciphertext b64url>
//
// Keys: FIELD_KEYS="v1:<32-byte base64>,v2:<32-byte base64>" and FIELD_KEY_ACTIVE="v2".
// Rotation: add a new key, make it active, run `npm run keys:rotate` to re-encrypt, then retire the old key.
// In production keep these in a secrets manager (AWS Secrets Manager / Azure Key Vault / GCP Secret Manager).
// Development fallback: a key derived from AUTH_SECRET, so local data stays encrypted without extra setup.
//
// This protects data on disk and in backups. It is NOT end-to-end encryption: the server can decrypt
// messages (needed for safety screening and reviewing reported conversations), and the app says so.

const PREFIX = "enc:";

type Keyring = { active: string; keys: Map<string, Buffer> };
let cached: Keyring | null = null;

export function keyring(): Keyring {
  if (cached) return cached;
  const keys = new Map<string, Buffer>();
  for (const part of (process.env.FIELD_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [id, b64] = part.split(":");
    const key = Buffer.from(b64 ?? "", "base64");
    if (!id || key.length !== 32) throw new Error(`FIELD_KEYS entry "${id}" must be 32 bytes base64`);
    keys.set(id, key);
  }
  let active = process.env.FIELD_KEY_ACTIVE ?? [...keys.keys()].pop() ?? "";
  if (!keys.size) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_DERIVED_FIELD_KEY !== "true") throw new Error("FIELD_KEYS must be set in production");
    keys.set("d1", Buffer.from(hkdfSync("sha256", process.env.AUTH_SECRET ?? "", "project-connect", "field-encryption-v1", 32)));
    active = "d1";
  }
  if (!keys.has(active)) throw new Error(`FIELD_KEY_ACTIVE "${active}" is not in FIELD_KEYS`);
  cached = { active, keys };
  return cached;
}

/** For tests / rotation scripts. */
export function resetKeyring() { cached = null; }

export function isSealed(v: string | null | undefined) {
  return !!v && v.startsWith(PREFIX);
}

export function seal(plain: string, aad = ""): string {
  const { active, keys } = keyring();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keys.get(active)!, iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${PREFIX}${active}:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

/** Opens a sealed value. Plain (legacy, pre-encryption) values pass through unchanged. */
export function open(value: string, aad = ""): string {
  if (!isSealed(value)) return value;
  const [, keyId, iv, tag, ct] = value.split(":");
  const key = keyring().keys.get(keyId);
  if (!key) throw new Error(`No key "${keyId}" to decrypt with`);
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/** Never throws: a value that can't be opened shows as unavailable rather than breaking a whole chat. */
export function openSafe(value: string, aad = ""): string {
  try { return open(value, aad); } catch { return "[message unavailable]"; }
}

export function keyIdOf(value: string) {
  return isSealed(value) ? value.split(":")[1] : null;
}
