import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// TOTP (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits) — the standard used by Google Authenticator,
// Microsoft Authenticator, 1Password etc. Accepts the previous and next step for clock drift.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret() {
  const bytes = randomBytes(20);
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string) {
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error("bad base32");
    bits += v.toString(2).padStart(5, "0");
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

export function totpAt(secret: string, timeMs: number, step = 30) {
  const counter = Math.floor(timeMs / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}

export function verifyTotp(secret: string, code: string, now = Date.now()) {
  return totpStep(secret, code, now) !== null;
}

/** The 30-second step a code belongs to (or null). Callers store it so the same code can't be used twice. */
export function totpStep(secret: string, code: string, now = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  for (const w of [-1, 0, 1]) {
    const t = now + w * 30_000;
    if (timingSafeEqual(Buffer.from(totpAt(secret, t)), Buffer.from(c))) return Math.floor(t / 30_000);
  }
  return null;
}

export function otpauthUrl(secret: string, account: string) {
  return `otpauth://totp/${encodeURIComponent("Project Connect")}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent("Project Connect")}&digits=6&period=30`;
}
