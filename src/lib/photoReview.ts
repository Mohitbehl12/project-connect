import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { ApiError } from "./http";
import { notify } from "./notify";
import { refreshCompleteness } from "./photos";
import { storage } from "./storage";

export async function pendingPhotos() {
  const rows = await db.select({ photo: schema.photos, name: schema.profiles.firstName }).from(schema.photos)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.photos.userId))
    .where(eq(schema.photos.status, "PENDING")).orderBy(asc(schema.photos.id)).limit(60);
  const s = storage();
  return Promise.all(rows.map(async ({ photo, name }) => ({ id: photo.id, userId: photo.userId, name: name ?? "", url: await s.url(photo.storageKey, 900), width: photo.width, height: photo.height })));
}

/** Staff decision on a waiting photo. A refused photo is deleted, and the person is told why in general terms. */
export async function reviewPhoto(staffId: string, id: string, approve: boolean) {
  const p = await db.query.photos.findFirst({ where: eq(schema.photos.id, id) });
  if (!p) throw new ApiError(404, "Photo not found.", "not_found");
  if (p.status !== "PENDING") throw new ApiError(409, "This photo has already been reviewed.", "reviewed");
  if (approve) {
    await db.update(schema.photos).set({ status: "LIVE" }).where(eq(schema.photos.id, id));
    await notify(p.userId, "MODERATION", "Your photo is approved", "It's now on your profile.", "/photos");
  } else {
    await db.delete(schema.photos).where(eq(schema.photos.id, id));
    await storage().delete(p.storageKey).catch(() => {});
    const rest = await db.select().from(schema.photos).where(eq(schema.photos.userId, p.userId)).orderBy(asc(schema.photos.position));
    for (let i = 0; i < rest.length; i++) if (rest[i].position !== i) await db.update(schema.photos).set({ position: i }).where(eq(schema.photos.id, rest[i].id));
    await notify(p.userId, "MODERATION", "A photo wasn't approved", "It didn't meet our Community Guidelines, so we removed it. Add a clear photo of yourself instead.", "/photos");
  }
  await refreshCompleteness(p.userId);
  await audit(staffId, approve ? "photo.approve" : "photo.reject", "photo", id, { userId: p.userId });
  return { status: approve ? "LIVE" : "REMOVED" };
}
