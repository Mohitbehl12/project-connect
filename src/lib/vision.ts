import "server-only";
import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

// Talks to workers/vision.mjs (on-server image models) running in its own process with a memory cap.
// If it can't start, runs out of memory or is too slow, callers get null and fall back to a person.
let child: ChildProcess | null = null;
const waiting = new Map<string, (r: { ok: boolean; result?: unknown; error?: string }) => void>();

function worker() {
  if (child && child.connected) return child;
  const c = fork(path.join(process.cwd(), "workers", "vision.mjs"), [], { execArgv: [`--max-old-space-size=${process.env.VISION_MEMORY_MB ?? 384}`], stdio: ["ignore", "ignore", "pipe", "ipc"] });
  c.on("message", (m: any) => { if (m?.id && waiting.has(m.id)) { waiting.get(m.id)!(m); waiting.delete(m.id); } });
  c.on("exit", () => { for (const [, cb] of waiting) cb({ ok: false, error: "stopped" }); waiting.clear(); if (child === c) child = null; });
  c.stderr?.on("data", () => {});
  child = c;
  return c;
}

function ask<T>(task: "nsfw" | "faces", rgb: Buffer, w: number, h: number, timeoutMs: number): Promise<T | null> {
  const id = randomUUID();
  return new Promise((resolve) => {
    const t = setTimeout(() => { waiting.delete(id); resolve(null); }, timeoutMs);
    waiting.set(id, (r) => { clearTimeout(t); resolve(r.ok ? (r.result as T) : null); });
    try { worker().send({ id, task, rgb: rgb.toString("base64"), w, h }); } catch { clearTimeout(t); waiting.delete(id); resolve(null); }
  });
}

export function localScanEnabled() { return process.env.PHOTO_SCAN_LOCAL !== "false"; }

/** Nudity model class probabilities (Porn, Hentai, Sexy, Neutral, Drawing), or null if it couldn't run. */
export async function scanLocally(image: Buffer, timeoutMs = 25_000) {
  const rgb = await sharp(image).resize(224, 224, { fit: "cover" }).removeAlpha().raw().toBuffer();
  return ask<Record<string, number>>("nsfw", rgb, 224, 224, timeoutMs);
}

export type Face = { score: number; descriptor: number[] };

/** Faces found in an image, each with a 128-number descriptor, or null if the check couldn't run. */
export async function findFaces(image: Buffer, timeoutMs = 30_000): Promise<Face[] | null> {
  const { data, info } = await sharp(image).rotate().resize(640, 640, { fit: "inside", withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return ask<Face[]>("faces", data, info.width, info.height, timeoutMs);
}

/** Distance between two faces: under about 0.5 is very likely the same person, over 0.6 probably not. */
export function faceDistance(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export type MatchLevel = "STRONG" | "POSSIBLE" | "UNLIKELY" | "NO_PROFILE_FACE";
export function matchLevel(distance: number | null): MatchLevel {
  if (distance === null) return "NO_PROFILE_FACE";
  // Stricter than the library default (0.6): in testing two different people scored 0.57. A person decides.
  return distance < 0.45 ? "STRONG" : distance < 0.55 ? "POSSIBLE" : "UNLIKELY";
}
