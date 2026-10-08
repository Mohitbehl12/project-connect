import { destroySession, revokeRefresh } from "@/lib/auth";
import { ok, publicRoute } from "@/lib/http";

/** Clears the web cookie; native apps also send their refresh token so the session is revoked server-side. */
export const POST = publicRoute(async ({ req }) => {
  let refreshToken: unknown;
  try { refreshToken = (await req.json())?.refreshToken; } catch { /* no body */ }
  if (typeof refreshToken === "string" && refreshToken.length < 200) await revokeRefresh(refreshToken);
  await destroySession();
  return ok({ ok: true });
});
