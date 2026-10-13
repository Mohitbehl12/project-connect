import "server-only";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import * as argon2 from "@node-rs/argon2";
import { cookies, headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";

export const SESSION_COOKIE = "pc_session";
const SESSION_DAYS = 14;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

// Passwords: Argon2id (OWASP parameters: 19 MiB memory, 2 iterations, 1 lane). Older bcrypt hashes
// still verify and are upgraded to Argon2id the next time the person signs in.
export async function hashPassword(pw: string) {
  return argon2.hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 }); // library default algorithm is Argon2id
}
export async function verifyPassword(pw: string, hash: string) {
  if (hash.startsWith("$argon2")) return argon2.verify(hash, pw).catch(() => false);
  if (hash.startsWith("$2")) return bcrypt.compare(pw, hash);
  return false;
}

export function needsRehash(hash: string) {
  return !hash.startsWith("$argon2id$");
}

export async function createSession(user: Pick<User, "id" | "tokenVersion" | "role">) {
  const token = await new SignJWT({ v: user.tokenVersion, r: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  // Secure everywhere in production except plain-http localhost, which some browsers refuse Secure cookies on.
  const host = (await headers()).get("host") ?? "";
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !isLocal,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Resolves the signed-in user from the session cookie.
 * Rejects tokens whose version no longer matches (password change, ban, "log out everywhere").
 */
export async function currentUser(): Promise<User | null> {
  // Native apps send "Authorization: Bearer <access token>"; the web uses the cookie.
  const auth = (await headers()).get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const token = bearer ?? (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    if (bearer && payload.typ !== "access") return null; // refresh tokens are opaque; only access JWTs here
    // An app session signed out from the Security screen stops working at once, not when its token expires.
    if (bearer && typeof payload.sid === "string") {
      const live = await db.query.sessions.findFirst({ where: and(eq(schema.sessions.family, payload.sid), isNull(schema.sessions.revokedAt)) });
      if (!live) return null;
    }
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, payload.sub) });
    if (!user || user.tokenVersion !== payload.v || user.status === "BANNED" || user.status === "DELETED") return null;
    return user;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Native app tokens: 15-minute access JWT + 30-day rotating opaque refresh token
// ---------------------------------------------------------------------------
const ACCESS_MINUTES = 15;
const REFRESH_DAYS = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function accessToken(user: Pick<User, "id" | "tokenVersion" | "role">, sid?: string) {
  return new SignJWT({ v: user.tokenVersion, r: user.role, typ: "access", sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_MINUTES}m`)
    .sign(secret());
}

export type TokenPair = { accessToken: string; refreshToken: string; expiresIn: number };

export async function issueTokens(user: Pick<User, "id" | "tokenVersion" | "role">, device?: { name?: string; platform?: string; ip?: string; installId?: string }, family?: string): Promise<TokenPair> {
  const refreshToken = randomBytes(32).toString("base64url");
  const fam = family ?? randomUUID();
  await db.insert(schema.sessions).values({
    userId: user.id,
    family: fam,
    ip: device?.ip?.slice(0, 64),
    installId: device?.installId?.slice(0, 64),
    refreshHash: sha256(refreshToken),
    deviceName: device?.name?.slice(0, 80),
    platform: device?.platform?.slice(0, 20),
    expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400_000),
  });
  return { accessToken: await accessToken(user, fam), refreshToken, expiresIn: ACCESS_MINUTES * 60 };
}

/**
 * Rotates a refresh token. Presenting an already-rotated token means it leaked:
 * the whole login family is revoked and the caller must sign in again.
 */
export async function rotateRefresh(refreshToken: string): Promise<TokenPair | null> {
  const row = await db.query.sessions.findFirst({ where: eq(schema.sessions.refreshHash, sha256(refreshToken)) });
  if (!row) return null;
  if (row.revokedAt) {
    await db.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.family, row.family), isNull(schema.sessions.revokedAt)));
    return null;
  }
  if (row.expiresAt.getTime() < Date.now()) return null;
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) });
  if (!user || user.status === "BANNED" || user.status === "DELETED") return null;
  await db.update(schema.sessions).set({ revokedAt: new Date(), lastUsedAt: new Date() }).where(eq(schema.sessions.id, row.id));
  return issueTokens(user, { name: row.deviceName ?? undefined, platform: row.platform ?? undefined, ip: row.ip ?? undefined, installId: row.installId ?? undefined }, row.family);
}

export async function revokeRefresh(refreshToken: string) {
  const row = await db.query.sessions.findFirst({ where: eq(schema.sessions.refreshHash, sha256(refreshToken)) });
  if (row) await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.family, row.family));
}

/** Revokes every native session for a user (ban, role change, "log out everywhere"). */
export async function revokeAllSessions(userId: string) {
  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
}

export const PASSWORD_RULES = "At least 8 characters, including a letter and a number.";
export function passwordOk(pw: string) {
  return pw.length >= 8 && pw.length <= 128 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

/** The refresh-token family of the current app session (from the access token), if any. */
export async function currentSessionFamily(): Promise<string | null> {
  const h = (await headers()).get("authorization");
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}
