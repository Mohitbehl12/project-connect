import "server-only";
import sharp from "sharp";
import { encode } from "blurhash";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { storage } from "./storage";
import { ApiError } from "./http";
import { profileCompleteness } from "./matching";

export const MAX_PHOTOS = 6;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type PhotoQuality = "GOOD" | "DARK" | "BLURRY" | "SMALL";

/**
 * Normalises an upload: honours EXIF rotation, strips ALL metadata (including GPS),
 * resizes to 1080 px wide WebP, and computes a blurhash and simple quality hints.
 * Quality hints are about light and focus only — never about how someone looks.
 */
export async function processPhoto(input: Buffer) {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new ApiError(422, "That file isn't a photo we can read. Try a JPEG or PNG.", "bad_image");
  }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format))
    throw new ApiError(422, "Please upload a JPEG, PNG or WebP photo.", "bad_format");
  if (!meta.width || !meta.height || meta.width * meta.height > 50_000_000)
    throw new ApiError(422, "That photo is too large to process.", "too_large");

  const base = sharp(input, { failOn: "error" }).rotate(); // apply EXIF orientation, then metadata is dropped on output
  const out = await base.clone().resize({ width: 1080, height: 1440, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });

  // Brightness: mean luminance of a small greyscale copy.
  const grey = await sharp(out.data).resize(256, 256, { fit: "inside" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const px = grey.data;
  let sum = 0;
  for (let i = 0; i < px.length; i++) sum += px[i];
  const brightness = sum / px.length;

  // Focus: variance of a Laplacian-filtered copy (low variance = few edges = blurry).
  const lap = await sharp(grey.data, { raw: { width: grey.info.width, height: grey.info.height, channels: 1 } })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .raw().toBuffer();
  let m = 0;
  for (let i = 0; i < lap.length; i++) m += lap[i];
  m /= lap.length;
  let v = 0;
  for (let i = 0; i < lap.length; i++) v += (lap[i] - m) ** 2;
  const sharpness = v / lap.length;

  const quality: PhotoQuality =
    Math.min(meta.width, meta.height) < 400 ? "SMALL" : brightness < 55 ? "DARK" : sharpness < 20 ? "BLURRY" : "GOOD";

  const tiny = await sharp(out.data).resize(32, 32, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const blurhash = encode(new Uint8ClampedArray(tiny.data), tiny.info.width, tiny.info.height, 4, 4);

  return { data: out.data, width: out.info.width, height: out.info.height, blurhash, quality, brightness, sharpness };
}

export const QUALITY_HINT: Record<PhotoQuality, string> = {
  GOOD: "Great photo!",
  DARK: "Looks a little dark. Try a brighter photo so people can see you.",
  BLURRY: "This one's a bit soft. A sharper photo will stand out more.",
  SMALL: "This photo is quite small. A larger one will look better on cards.",
};

export async function photosFor(userIds: string[]) {
  const map = new Map<string, { id: string; url: string; blurhash: string; width: number; height: number }[]>();
  if (!userIds.length) return map;
  const rows = await db.select().from(schema.photos)
    .where(and(inArray(schema.photos.userId, userIds), eq(schema.photos.status, "LIVE")))
    .orderBy(asc(schema.photos.position));
  const s = storage();
  for (const r of rows) {
    const list = map.get(r.userId) ?? [];
    list.push({ id: r.id, url: await s.url(r.storageKey), blurhash: r.blurhash, width: r.width, height: r.height });
    map.set(r.userId, list);
  }
  return map;
}

/** Recomputes the stored completeness score after photos, answers or profile fields change. */
export async function refreshCompleteness(userId: string) {
  const p = await db.query.profiles.findFirst({ where: eq(schema.profiles.userId, userId) });
  if (!p) return;
  const [photoRows, answers] = await Promise.all([
    db.select({ id: schema.photos.id }).from(schema.photos).where(and(eq(schema.photos.userId, userId), eq(schema.photos.status, "LIVE"))),
    db.select({ id: schema.personalityAnswers.id }).from(schema.personalityAnswers).where(eq(schema.personalityAnswers.userId, userId)),
  ]);
  let prompts: unknown[] = [];
  try { prompts = JSON.parse(p.prompts); } catch { /* ignore */ }
  const completeness = profileCompleteness({
    ...p, interests: p.interests.split(",").filter(Boolean), photos: photoRows.map((x) => x.id), prompts, answerCount: answers.length,
  });
  await db.update(schema.profiles).set({ completeness }).where(eq(schema.profiles.userId, userId));
  return completeness;
}

/**
 * Onboarding step from what is actually complete, in any order:
 * 0 nothing · 1 profile · 2 profile + preferences · 3 profile + preferences + ≥6 personality answers.
 */
export async function syncOnboardingStep(userId: string) {
  const [p, prefs, answers, user] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(schema.profiles.userId, userId) }),
    db.query.preferences.findFirst({ where: eq(schema.preferences.userId, userId) }),
    db.select({ id: schema.personalityAnswers.id }).from(schema.personalityAnswers).where(eq(schema.personalityAnswers.userId, userId)),
    db.query.users.findFirst({ where: eq(schema.users.id, userId) }),
  ]);
  const step = !p ? 0 : !prefs?.interestedIn ? 1 : answers.length < 6 ? 2 : 3;
  if (user && step > user.onboardingStep) await db.update(schema.users).set({ onboardingStep: step }).where(eq(schema.users.id, userId));
  return Math.max(step, user?.onboardingStep ?? 0);
}
