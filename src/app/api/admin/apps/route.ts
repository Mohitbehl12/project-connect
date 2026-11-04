import { and, count, desc, eq, inArray, isNotNull, like } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { APP_FEATURES, DEFAULT_RELEASE, PLATFORMS, appConfigFor, compareVersions, type Platform, type PlatformRelease } from "@/lib/appReleases";
import { audit } from "@/lib/audit";
import { getConfig, setConfig } from "@/lib/config";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { can } from "@/lib/rbac";

/** Admin → Apps: each platform's release settings, the versions people use, and open problems per platform. */
export const GET = route(async () => {
  const all = await getConfig("app.platforms");
  const versions = await db.select({ platform: schema.devices.platform, version: schema.devices.appVersion, n: count() }).from(schema.devices)
    .where(isNotNull(schema.devices.appVersion)).groupBy(schema.devices.platform, schema.devices.appVersion).orderBy(desc(count()));
  const open = ["NEW", "TRIAGED", "PR_OPEN", "REGRESSED"];
  const platforms = await Promise.all(PLATFORMS.map(async (p) => {
    const [{ n: incidents }] = await db.select({ n: count() }).from(schema.opsIncidents).where(and(inArray(schema.opsIncidents.status, open), like(schema.opsIncidents.service, `${p} %`)));
    const [{ n: devices }] = await db.select({ n: count() }).from(schema.devices).where(eq(schema.devices.platform, p));
    const release = { ...DEFAULT_RELEASE, ...(all[p] ?? {}) };
    return { platform: p, release, effective: appConfigFor(all, p, null).features, devices, openIncidents: incidents, versions: versions.filter((v) => v.platform === p).slice(0, 8).map((v) => ({ version: v.version, devices: v.n })) };
  }));
  return ok({ platforms, features: APP_FEATURES });
}, { permission: "admin.access" });

const Ver = z.string().trim().regex(/^\d{1,3}(\.\d{1,3}){1,2}$/, "Use a version like 1.2.0");
const Release = z.object({
  minVersion: Ver, latestVersion: Ver,
  storeUrl: z.string().trim().max(300).refine((u) => u === "" || /^https:\/\/(apps\.apple\.com|testflight\.apple\.com|play\.google\.com)\//.test(u), "Use an App Store, TestFlight or Google Play link").default(""),
  message: z.string().trim().max(200).default(""),
  features: z.object(Object.fromEntries(Object.keys(APP_FEATURES).map((k) => [k, z.boolean().optional()])) as Record<keyof typeof APP_FEATURES, z.ZodOptional<z.ZodBoolean>>).default({}),
});

/** Change one platform's release settings; the other platforms are untouched. */
export const PUT = route(async ({ req, user }) => {
  if (!can(user.role, "config.edit")) throw new ApiError(403, "You don't have permission to change app releases.", "forbidden");
  const b = await parseBody(req, z.object({ platform: z.enum(PLATFORMS), release: Release }));
  if (compareVersions(b.release.minVersion, b.release.latestVersion) > 0) throw new ApiError(422, "minVersion: The minimum version can't be newer than the latest version.", "validation");
  const all = await getConfig("app.platforms");
  const before = all[b.platform as Platform] ?? null;
  await setConfig("app.platforms", { ...all, [b.platform]: b.release as PlatformRelease }, user.id);
  await audit(user.id, "app.release.update", "config", b.platform, { before, after: b.release });
  return ok({ saved: true });
}, { permission: "admin.access" });
