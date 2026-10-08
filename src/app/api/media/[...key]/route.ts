import { storage, verifyMediaSignature } from "@/lib/storage";

/** Serves locally stored media behind a signed, expiring link (local driver only). */
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
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": key.endsWith(".webp") ? "image/webp" : key.endsWith(".m4a") ? "audio/mp4" : "application/octet-stream",
      "cache-control": `private, max-age=${maxAge}, immutable`,
      "x-content-type-options": "nosniff",
    },
  });
}
