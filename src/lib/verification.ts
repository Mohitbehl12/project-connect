import "server-only";
import { randomInt } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "./audit";
import { ApiError } from "./http";
import { notify } from "./notify";
import { storage } from "./storage";
import { faceDistance, findFaces, matchLevel } from "./vision";

// Selfie verification: a random pose (so an old photo can't be reused), a selfie from the front camera,
// an automatic check for exactly one face and a comparison with the member's profile photos, then a
// person decides. The selfie is deleted once they have.
export const POSES = {
  thumbs_up: { text: "Give a thumbs-up", emoji: "👍" },
  peace: { text: "Make a peace sign", emoji: "✌️" },
  wave: { text: "Wave with an open hand", emoji: "👋" },
  three: { text: "Hold up three fingers", emoji: "🤟" },
  cheek: { text: "Touch your cheek with one finger", emoji: "☝️" },
  ear: { text: "Put one hand behind your ear", emoji: "👂" },
} as const;
type PoseKey = keyof typeof POSES;
const TTL_MS = 15 * 60_000;

const poseOut = (k: string) => ({ key: k, ...(POSES[k as PoseKey] ?? { text: "Look at the camera", emoji: "🙂" }) });

export async function currentAttempt(userId: string) {
  return db.query.verificationAttempts.findFirst({ where: eq(schema.verificationAttempts.userId, userId), orderBy: desc(schema.verificationAttempts.createdAt) });
}

export async function verificationStatus(user: User) {
  const a = await currentAttempt(user.id);
  const live = a && (a.state === "CHALLENGE" || a.state === "RETAKE") && a.expiresAt.getTime() > Date.now();
  return {
    status: user.selfieStatus,
    attempt: live ? { id: a!.id, pose: poseOut(a!.pose), state: a!.state, expiresAt: a!.expiresAt, message: a!.note } : null,
  };
}

/** Step 1: hands out a random pose to do in the selfie. */
export async function startVerification(user: User) {
  if (user.selfieStatus === "VERIFIED") throw new ApiError(409, "You're already verified.", "already_verified");
  if (user.selfieStatus === "PENDING") throw new ApiError(409, "Your selfie is already being reviewed.", "pending");
  const keys = Object.keys(POSES) as PoseKey[];
  const pose = keys[randomInt(0, keys.length)];
  const [a] = await db.insert(schema.verificationAttempts).values({ userId: user.id, pose, expiresAt: new Date(Date.now() + TTL_MS) }).returning();
  await audit(user.id, "verification.started", "user", user.id, { pose });
  return { status: "CHALLENGE" as const, attemptId: a.id, pose: poseOut(pose), expiresAt: a.expiresAt };
}

/** Step 2: the selfie. Retakes are immediate; otherwise it waits for a person with the automatic result attached. */
export async function submitSelfie(user: User, attemptId: string, image: Buffer) {
  const a = await db.query.verificationAttempts.findFirst({ where: and(eq(schema.verificationAttempts.id, attemptId), eq(schema.verificationAttempts.userId, user.id)) });
  if (!a) throw new ApiError(404, "Start verification again.", "not_found");
  if (a.state !== "CHALLENGE" && a.state !== "RETAKE") throw new ApiError(409, "This selfie has already been sent.", "already_sent");
  if (a.expiresAt.getTime() < Date.now()) throw new ApiError(410, "That pose has expired. Start again for a new one.", "expired");

  let clean: Buffer;
  try { clean = await sharp(image).rotate().resize(1080, 1080, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(); }
  catch { throw new ApiError(422, "That file isn't a photo we can read. Take the selfie again.", "bad_image"); }

  const faces = await findFaces(clean);
  const retake = async (note: string) => {
    await db.update(schema.verificationAttempts).set({ state: "RETAKE", faceCount: faces?.length ?? null, note }).where(eq(schema.verificationAttempts.id, a.id));
    return { state: "RETAKE" as const, message: note, pose: poseOut(a.pose) };
  };
  if (faces && faces.length === 0) return retake("We couldn't see your face clearly. Face the camera in good light, without sunglasses, and try again.");
  if (faces && faces.length > 1) return retake("Only you should be in the selfie. Try again on your own.");

  // Compare with the person's live profile photos (their first face each).
  let best: number | null = null, profileFaces = 0;
  if (faces?.length === 1) {
    const photos = await db.select({ key: schema.photos.storageKey }).from(schema.photos).where(and(eq(schema.photos.userId, user.id), eq(schema.photos.status, "LIVE"))).limit(6);
    for (const p of photos) {
      const buf = await storage().get(p.key).catch(() => null);
      const f = buf ? (await findFaces(buf))?.[0] : undefined;
      if (!f) continue;
      profileFaces++;
      const d = faceDistance(faces[0].descriptor, f.descriptor);
      best = best === null ? d : Math.min(best, d);
    }
  }
  const key = `verification/${user.id}/${a.id}.webp`;
  await storage().put(key, clean, "image/webp");
  await db.update(schema.verificationAttempts).set({
    state: "PENDING", storageKey: key, faceCount: faces?.length ?? null, bestDistance: best, profileFaces, submittedAt: new Date(), note: null,
  }).where(eq(schema.verificationAttempts.id, a.id));
  await db.update(schema.users).set({ selfieStatus: "PENDING" }).where(eq(schema.users.id, user.id));
  await audit(user.id, "verification.submitted", "user", user.id, { faces: faces?.length ?? "unchecked", level: faces ? matchLevel(best) : "unchecked" });
  await notify(user.id, "VERIFICATION", "Selfie received", "A person on our team will check it shortly. You'll get your verified badge once it's approved.", "/safety");
  return { state: "PENDING" as const, message: "Thanks! A person on our team will check your selfie shortly." };
}

/** For Admin → Verification: each waiting selfie with its pose, profile photos and the automatic result. */
export async function verificationQueue() {
  const rows = await db.select({ a: schema.verificationAttempts, name: schema.profiles.firstName, city: schema.profiles.city, dob: schema.users.dob })
    .from(schema.verificationAttempts)
    .innerJoin(schema.users, eq(schema.users.id, schema.verificationAttempts.userId))
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.verificationAttempts.userId))
    .where(eq(schema.verificationAttempts.state, "PENDING")).orderBy(schema.verificationAttempts.submittedAt).limit(50);
  const s = storage();
  return Promise.all(rows.map(async ({ a, name, city, dob }) => {
    const photos = await db.select({ key: schema.photos.storageKey }).from(schema.photos).where(and(eq(schema.photos.userId, a.userId), eq(schema.photos.status, "LIVE"))).limit(4);
    return {
      attemptId: a.id, userId: a.userId, name: name ?? "", city: city ?? "", age: dob ? Math.floor((Date.now() - Date.parse(dob)) / 31_557_600_000) : null,
      pose: poseOut(a.pose), selfieUrl: a.storageKey ? await s.url(a.storageKey, 900) : null, submittedAt: a.submittedAt,
      faceCount: a.faceCount, profileFaces: a.profileFaces, distance: a.bestDistance,
      match: a.faceCount === null ? "UNCHECKED" : matchLevel(a.profileFaces ? a.bestDistance : null),
      photos: await Promise.all(photos.map((p) => s.url(p.key, 900))),
    };
  }));
}

/** Called when staff approve or reject: records the outcome and deletes the selfie image. */
export async function closeVerification(userId: string, approved: boolean, staffId: string, reason: string) {
  const open = await db.select().from(schema.verificationAttempts).where(and(eq(schema.verificationAttempts.userId, userId), inArray(schema.verificationAttempts.state, ["PENDING", "CHALLENGE", "RETAKE"])));
  for (const a of open) {
    if (a.storageKey) await storage().delete(a.storageKey).catch(() => {});
    await db.update(schema.verificationAttempts).set({ state: approved ? "APPROVED" : "REJECTED", storageKey: null, decidedAt: new Date(), decidedById: staffId, note: reason.slice(0, 300) }).where(eq(schema.verificationAttempts.id, a.id));
  }
}
