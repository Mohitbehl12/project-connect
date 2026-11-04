import { asPlatform, appConfigFor } from "@/lib/appReleases";
import { getConfig } from "@/lib/config";
import { ok, publicRoute } from "@/lib/http";

/** Per-platform app settings (public: the app needs it before sign-in). Nothing personal in or out. */
export const GET = publicRoute(async ({ req }) => {
  const platform = asPlatform(req.headers.get("x-platform"));
  const version = (req.headers.get("x-app-version") ?? "").slice(0, 20) || null;
  const res = ok(appConfigFor(await getConfig("app.platforms"), platform, version));
  res.headers.set("cache-control", "no-store");
  return res;
});
