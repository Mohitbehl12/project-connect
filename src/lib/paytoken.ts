import "server-only";
import { SignJWT, jwtVerify } from "jose";

// Short-lived token that lets the hosted pay page (opened in an in-app browser, without the app's
// session) act on exactly one payment or invoice. 30 minutes, single purpose.
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function signScoped(purpose: "pay" | "invoice", userId: string, id: string, minutes = 30) {
  return new SignJWT({ p: purpose, id }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${minutes}m`).sign(key());
}

export async function verifyScoped(token: string | null | undefined, purpose: "pay" | "invoice", id: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.p === purpose && payload.id === id && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function appUrl() {
  // Render sets RENDER_EXTERNAL_URL automatically; APP_URL (e.g. your own domain) wins when set.
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
}
