import { storage, verifyMediaSignature } from "@/lib/storage";

const TYPES: Record<string, string> = { webp: "image/webp", m4a: "audio/mp4", mp4: "audio/mp4", webm: "audio/webm", ogg: "audio/ogg", aac: "audio/aac" };
/** Ad creatives: images and short videos. */
const AD_TYPES: Record<string, string> = { webp: "image/webp", mp4: "video/mp4", webm: "video/webm" };

/**
 * Serves locally stored media behind a signed, expiring link (local driver only).
 * Supports byte ranges, which Safari requires before it will play audio.
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!verifyMediaSignature(key, exp, sig)) return new Response("Link expired", { status: 403 });
  const body = await storage().get(key);
  if (!body) return new Response("Not found", { status: 404 });
  const maxAge = Math.max(0, Math.floor(exp - Date.now() / 1000));
  const headers: Record<string, string> = {
    "content-type": (key.startsWith("ads/") ? AD_TYPES : TYPES)[key.split(".").pop() ?? ""] ?? "application/octet-stream",
    "cache-control": `private, max-age=${maxAge}, immutable`,
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
  };
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const size = body.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2] || 0);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    if (!range[1]) { start = Math.max(0, start); end = size - 1; }
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
    end = Math.min(end, size - 1);
    return new Response(new Uint8Array(body.subarray(start, end + 1)), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(new Uint8Array(body), { headers: { ...headers, "content-length": String(body.length) } });
}
