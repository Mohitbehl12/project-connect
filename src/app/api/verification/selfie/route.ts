import { ApiError, ok, route } from "@/lib/http";
import { MAX_UPLOAD_BYTES } from "@/lib/photos";
import { rateLimit } from "@/lib/ratelimit";
import { submitSelfie } from "@/lib/verification";

/** The selfie for an open pose (multipart: "file" and "attemptId"). */
export const POST = route(async ({ req, user }) => {
  await rateLimit(`verify-selfie:${user.id}`, 12, 60 * 60_000);
  if (Number(req.headers.get("content-length") ?? 0) > 11 * 1024 * 1024) throw new ApiError(413, "That file is too large (10 MB at most).", "too_large");
  let form: FormData;
  try { form = await req.formData(); } catch { throw new ApiError(400, "Send the selfie as form data.", "bad_form"); }
  const file = form.get("file"), attemptId = String(form.get("attemptId") ?? "");
  if (!(file instanceof Blob) || !attemptId) throw new ApiError(422, "Take the selfie first.", "validation");
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "That photo is too large.", "too_large");
  return ok(await submitSelfie(user, attemptId, Buffer.from(await file.arrayBuffer())));
});
