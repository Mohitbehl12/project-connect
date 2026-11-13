import { z } from "zod";
import { and, asc, count, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import { ApiError, ok, parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { MAX_PHOTOS, MAX_UPLOAD_BYTES, QUALITY_HINT, duplicatePhotoOwners, processPhoto, refreshCompleteness, type PhotoQuality } from "@/lib/photos";
import { addRiskSignal } from "@/lib/risk";
import { fileAutomatedReport, logAutomatedDecision } from "@/lib/safety";
import { storage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { screenPhoto } from "@/lib/photoScreen";

const PENDING_HINT = "Thanks! We're checking this photo. Others will see it once it's approved, usually within a few hours.";
const REJECTED_HINT = "This photo wasn't approved. It isn't shown to anyone — remove it and add another.";

async function myPhotos(userId: string) {
  const rows = await db.select().from(schema.photos).where(eq(schema.photos.userId, userId)).orderBy(asc(schema.photos.position));
  const s = storage();
  return Promise.all(rows.map(async (r) => ({
    id: r.id, url: await s.url(r.storageKey), blurhash: r.blurhash, width: r.width, height: r.height, position: r.position,
    status: r.status, quality: r.quality, hint: r.status === "PENDING" ? PENDING_HINT : r.status === "REJECTED" ? REJECTED_HINT : QUALITY_HINT[r.quality as PhotoQuality],
  })));
}

/** Same picture already on another account → a fake-profile report for a person to review (never an automatic block). */
async function duplicatePhotoCheck(userId: string, photoId: string, dhash: string) {
  const others = await duplicatePhotoOwners(userId, dhash);
  if (!others.length) return;
  await addRiskSignal(userId, "DUPLICATE_PHOTO", 20, `Same photo as ${others.length} other account${others.length > 1 ? "s" : ""}`);
  const report = await fileAutomatedReport({ reportedId: userId, category: "FAKE", details: `Automated check: a new photo matches a photo on ${others.length} other account${others.length > 1 ? "s" : ""} (${others.slice(0, 5).join(", ")}). Check which account it belongs to.` });
  await logAutomatedDecision({ userId, kind: "PHOTO_DUPLICATE", decision: "SENT_FOR_HUMAN_REVIEW", reason: "One of your photos looks the same as a photo on another account. A person will check whose photo it is. Nothing happens to your account automatically.", system: "rules:photo-dhash-v1", refId: report.id });
  await audit(null, "photo.duplicate_detected", "photo", photoId, { others: others.length });
}

export const GET = route(async ({ user }) => ok({ photos: await myPhotos(user.id), max: MAX_PHOTOS }), { allowSuspended: true });

/**
 * Upload one photo as multipart form-data (field "file"). It's checked before anyone else can see it
 * (lib/photoScreen): explicit photos are refused, borderline ones wait for staff review.
 */
export const POST = route(async ({ req, user }) => {
  await rateLimit(`photo:${user.id}`, 30, 60 * 60_000);
  const [{ n }] = await db.select({ n: count() }).from(schema.photos).where(eq(schema.photos.userId, user.id));
  if (n >= MAX_PHOTOS) throw new ApiError(409, `You can have up to ${MAX_PHOTOS} photos. Remove one to add another.`, "photo_limit");

  if (Number(req.headers.get("content-length") ?? 0) > 11 * 1024 * 1024) throw new ApiError(413, "That file is too large (10 MB at most).", "too_large");

  let form: FormData;
  try { form = await req.formData(); } catch { throw new ApiError(400, "Send the photo as form data in a field called \"file\".", "bad_form"); }
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new ApiError(422, "file: Choose a photo to upload.", "validation");
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "That photo is over 10 MB. Try a smaller one.", "too_large");

  const processed = await processPhoto(Buffer.from(await file.arrayBuffer()));
  const check = await screenPhoto(processed.data);
  if (check.status === "REJECTED") {
    await audit(user.id, "photo.rejected_auto", "user", user.id, { reason: check.reason });
    throw new ApiError(422, "This photo can't be used because it looks explicit. Please choose a different one — see our Community Guidelines.", "photo_rejected");
  }
  // A verified badge vouches for the photos staff compared with the selfie. A photo added afterwards was
  // not part of that check, so it waits for a person even when automated screening passed it.
  const status = user.selfieStatus === "VERIFIED" && check.status === "LIVE" ? "PENDING" : check.status;
  const key = `photos/${user.id}/${randomUUID()}.webp`;
  await storage().put(key, processed.data, "image/webp");
  const [row] = await db.insert(schema.photos).values({
    userId: user.id, storageKey: key, position: n, width: processed.width, height: processed.height,
    blurhash: processed.blurhash, quality: processed.quality, status, dhash: processed.dhash,
  }).returning();
  await duplicatePhotoCheck(user.id, row.id, processed.dhash).catch(() => {}); // never blocks the upload
  const completeness = await refreshCompleteness(user.id);
  await audit(user.id, "photo.upload", "photo", row.id, { quality: processed.quality, check: check.reason, heldAfterVerification: status !== check.status });
  return ok({
    photo: { id: row.id, url: await storage().url(key), blurhash: row.blurhash, width: row.width, height: row.height, position: row.position, status: row.status, quality: row.quality, hint: row.status === "PENDING" ? PENDING_HINT : QUALITY_HINT[processed.quality] },
    completeness,
  }, 201);
});

/** Reorder: the first id becomes the primary photo. */
export const PATCH = route(async ({ req, user }) => {
  const { order } = await parseBody(req, z.object({ order: z.array(z.string()).min(1).max(MAX_PHOTOS) }));
  const mine = await db.select({ id: schema.photos.id }).from(schema.photos).where(eq(schema.photos.userId, user.id));
  const ids = new Set(mine.map((m) => m.id));
  if (order.length !== ids.size || order.some((id) => !ids.has(id))) throw new ApiError(422, "order: Include each of your photos exactly once.", "validation");
  for (let i = 0; i < order.length; i++)
    await db.update(schema.photos).set({ position: i }).where(and(eq(schema.photos.id, order[i]), eq(schema.photos.userId, user.id)));
  return ok({ photos: await myPhotos(user.id) });
});
