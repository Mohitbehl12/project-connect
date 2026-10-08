import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, ok, route } from "@/lib/http";
import { refreshCompleteness } from "@/lib/photos";
import { storage } from "@/lib/storage";

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const photo = await db.query.photos.findFirst({ where: and(eq(schema.photos.id, params.id), eq(schema.photos.userId, user.id)) });
  if (!photo) throw new ApiError(404, "Photo not found.", "not_found");
  await db.delete(schema.photos).where(eq(schema.photos.id, photo.id));
  await storage().delete(photo.storageKey);
  const rest = await db.select().from(schema.photos).where(eq(schema.photos.userId, user.id)).orderBy(asc(schema.photos.position));
  for (let i = 0; i < rest.length; i++) if (rest[i].position !== i) await db.update(schema.photos).set({ position: i }).where(eq(schema.photos.id, rest[i].id));
  const completeness = await refreshCompleteness(user.id);
  return ok({ deleted: true, completeness });
}, { allowSuspended: true });
