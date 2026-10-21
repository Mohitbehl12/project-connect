import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { requireAdvertiser } from "@/lib/ads";
import { ApiError, ok, route } from "@/lib/http";
import { screenPhoto } from "@/lib/photoScreen";
import { rateLimit } from "@/lib/ratelimit";
import { storage } from "@/lib/storage";

const isMp4 = (b: Buffer) => b.length > 12 && b.subarray(4, 8).toString() === "ftyp";
const isWebm = (b: Buffer) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;

/** Upload an image, logo or short video for an ad. Images are re-encoded (metadata removed) and screened. */
export const POST = route(async ({ req, user }) => {
  const adv = await requireAdvertiser(user);
  await rateLimit(`ad-upload:${user.id}`, 60, 60 * 60_000);
  if (Number(req.headers.get("content-length") ?? 0) > 21 * 1024 * 1024) throw new ApiError(413, "Files can be up to 20 MB.", "too_large");
  let form: FormData;
  try { form = await req.formData(); } catch { throw new ApiError(400, "Send the file as form data.", "bad_form"); }
  const file = form.get("file"), kind = String(form.get("kind") ?? "image");
  if (!(file instanceof Blob)) throw new ApiError(422, "file: Choose a file.", "validation");
  const buf = Buffer.from(await file.arrayBuffer());
  if (kind === "video") {
    if (buf.length > 20 * 1024 * 1024) throw new ApiError(413, "Videos can be up to 20 MB (about 30 seconds).", "too_large");
    const ext = isMp4(buf) ? "mp4" : isWebm(buf) ? "webm" : null;
    if (!ext) throw new ApiError(422, "Upload an MP4 or WebM video.", "bad_format");
    const key = `ads/${adv.id}/${randomUUID()}.${ext}`;
    await storage().put(key, buf, ext === "mp4" ? "video/mp4" : "video/webm");
    return ok({ key, url: await storage().url(key, 3600), note: "Videos are checked by a person during review." }, 201);
  }
  let out: Buffer;
  try {
    const img = sharp(buf, { failOn: "error" }).rotate();
    out = kind === "logo" ? await img.resize(256, 256, { fit: "cover" }).webp({ quality: 85 }).toBuffer()
      : await img.resize({ width: 1200, height: 1500, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch { throw new ApiError(422, "That file isn't an image we can read. Use JPEG, PNG or WebP.", "bad_image"); }
  const s = await screenPhoto(out);
  if (s.status === "REJECTED") throw new ApiError(422, "This image can't be used in ads. See the Advertising Policy.", "image_rejected");
  const key = `ads/${adv.id}/${randomUUID()}.webp`;
  await storage().put(key, out, "image/webp");
  return ok({ key, url: await storage().url(key, 3600), needsReview: s.status === "PENDING" }, 201);
}, { allowOnboarding: true });
