import { ApiError, ok, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { sendPhoto, sendVoice } from "@/lib/chatMedia";

/** Sends a photo or voice message: multipart form with "file", "kind" (photo | voice) and, for voice, "ms". */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  await rateLimit(`chat-media:${user.id}`, 40, 60 * 60_000);
  let form: FormData;
  try { form = await req.formData(); } catch { throw new ApiError(400, "Send the file as form data.", "bad_form"); }
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new ApiError(422, "file: Choose something to send.", "validation");
  if (file.size > 10 * 1024 * 1024) throw new ApiError(413, "That file is too large.", "too_large");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = String(form.get("kind") ?? "photo");
  const msg = kind === "voice" ? await sendVoice(user, params.id, buf, Number(form.get("ms") ?? 0)) : await sendPhoto(user, params.id, buf);
  return ok({ id: msg.id, createdAt: msg.createdAt }, 201);
});
