// Gives every seeded test user 2–3 generated placeholder "portraits": abstract silhouettes on
// brand-colour gradients. They are deliberately NOT photos of people — real users upload their own.
// Local storage driver only. Run after the main seed: npm run db:seed-photos (add -- --force to regenerate)
import "./env";
import sharp from "sharp";
import { encode } from "blurhash";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, like, or } from "drizzle-orm";
import * as s from "../src/db/schema";

const db = drizzle(createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN || undefined }), { schema: s });
const ROOT = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve("data", "uploads");
const CACHE = path.resolve("data", ".photo-cache");

// Warm, editorial palettes: [deep, mid, light, rim]
const PALETTES = [
  ["#1E1B4B", "#7C5CFF", "#FFB86B", "#FFD9A8"], ["#3B0D2E", "#E2557A", "#FFC77A", "#FFE3B8"],
  ["#0F2E2A", "#3F9E84", "#F4E3B5", "#FFF4D6"], ["#1A1033", "#C8406A", "#F7B54C", "#FFE0A3"],
  ["#14213D", "#4D7CFE", "#FCA17D", "#FFD8C2"], ["#2B1A0F", "#D9822B", "#FFE1A1", "#FFF2D0"],
  ["#0E1A2B", "#2A9D8F", "#E9C46A", "#FFF1C1"], ["#2A0F3D", "#9B5DE5", "#F15BB5", "#FFD1EC"],
];
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const GRAIN = `<filter id="softer"><feGaussianBlur stdDeviation="14"/></filter>`;

/** Mesh-gradient backdrop: several soft radial colour fields over a deep base (radial gradients, not blur — fast to render). */
let blobId = 0;
function blob(cx: number, cy: number, r: number, col: string, op: number) {
  const id = `b${blobId++}`;
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${col}" stop-opacity="${op}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient><rect width="1080" height="1440" fill="url(#${id})"/>`;
}
function mesh(a: string, b: string, c: string) {
  return `<rect width="1080" height="1440" fill="${a}"/>` + [b, c, b].map((col) => blob(100 + rand() * 880, 100 + rand() * 1240, 500 + rand() * 300, col, 0.85)).join("");
}

function shoulders(x: number, y: number) {
  return `M${x - 60} ${y} C ${x - 90} ${y + 70}, ${x - 250} ${y + 60}, ${x - 350} ${y + 140} C ${x - 440} ${y + 210}, ${x - 470} ${y + 400}, ${x - 480} 1700 L ${x + 480} 1700 C ${x + 470} ${y + 400}, ${x + 440} ${y + 210}, ${x + 350} ${y + 140} C ${x + 250} ${y + 60}, ${x + 90} ${y + 70}, ${x + 60} ${y} Z`;
}
function shoulderRim(x: number, y: number) {
  return `M${x + 70} ${y + 40} C ${x + 150} ${y + 70}, ${x + 270} ${y + 70}, ${x + 350} ${y + 140} C ${x + 430} ${y + 210}, ${x + 462} ${y + 380}, ${x + 472} ${y + 560}`;
}

/** Variant 0: portrait silhouette with rim light. 1: sunset horizon scene. 2: bokeh lights. All abstract — no real people. */
export function svg(i: number, variant: number) {
  const [a, b, c, rim] = PALETTES[(i + variant * 3) % PALETTES.length];
  let body = "";
  if (variant % 3 === 0) {
    const hx = 540 + (rand() - 0.5) * 140, hy = 640 + (rand() - 0.5) * 60, r = 155 + rand() * 25;
    const tilt = (rand() - 0.5) * 10;
    body = `
  <radialGradient id="halo" cx="${hx / 1080}" cy="${(hy - 60) / 1440}" r=".42"><stop offset="0" stop-color="${rim}" stop-opacity=".75"/><stop offset="1" stop-color="${rim}" stop-opacity="0"/></radialGradient>
  <rect width="1080" height="1440" fill="url(#halo)"/>
  <g transform="rotate(${tilt} ${hx} ${hy})">
    <rect x="${hx - 62}" y="${hy + r * 0.55}" width="124" height="${r * 0.75}" rx="40" fill="${a}"/>
    <path d="${shoulders(hx, hy + r * 1.05)}" fill="${a}"/>
    <ellipse cx="${hx}" cy="${hy}" rx="${r * 0.84}" ry="${r}" fill="${a}"/>
    <ellipse cx="${hx}" cy="${hy}" rx="${r * 0.86}" ry="${r}" fill="none" stroke="${rim}" stroke-width="10" stroke-opacity=".9" stroke-dasharray="${r * 2.4} ${r * 10}" transform="rotate(-150 ${hx} ${hy})" filter="url(#softer)"/>
    <path d="${shoulderRim(hx, hy + r * 1.05)}" fill="none" stroke="${rim}" stroke-width="12" stroke-opacity=".7" filter="url(#softer)"/>
  </g>`;
  } else if (variant % 3 === 1) {
    const sy = 700 + rand() * 120;
    body = `
  <circle cx="${380 + rand() * 320}" cy="${sy}" r="170" fill="${rim}" fill-opacity=".95"/>
  ${blob(540, sy, 520, c, 0.45)}
  <path d="M0 ${sy + 140} C 260 ${sy + 40}, 520 ${sy + 220}, 1080 ${sy + 90} L1080 1440 L0 1440 Z" fill="${a}" fill-opacity=".85"/>
  <path d="M0 ${sy + 300} C 320 ${sy + 200}, 700 ${sy + 380}, 1080 ${sy + 260} L1080 1440 L0 1440 Z" fill="${a}"/>
  <path d="M0 ${sy + 300} C 320 ${sy + 200}, 700 ${sy + 380}, 1080 ${sy + 260}" fill="none" stroke="${rim}" stroke-opacity=".5" stroke-width="6"/>`;
  } else {
    const dots = Array.from({ length: 22 }, () => {
      const rr = 30 + rand() * 110;
      return blob(rand() * 1080, rand() * 1440, rr, [rim, c, b][Math.floor(rand() * 3)], 0.4 + rand() * 0.5);
    }).join("");
    body = dots;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <defs>${GRAIN}<linearGradient id="vig" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs>
  ${mesh(a, b, c)}${body}
  <rect width="1080" height="1440" fill="url(#vig)"/>
</svg>`;
}

/** Film grain, made once: random light/dark specks at low opacity, composited over every image. */
let grain: Buffer | null = null;
async function grainLayer() {
  if (grain) return grain;
  const w = 1080, h = 1440, px = Buffer.alloc(w * h * 4);
  for (let k = 0; k < w * h; k++) { const v = Math.random() < 0.5 ? 0 : 255; px[k * 4] = px[k * 4 + 1] = px[k * 4 + 2] = v; px[k * 4 + 3] = Math.floor(Math.random() * 18); }
  grain = await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  return grain;
}

async function main() {
  const users = await db.select({ id: s.users.id }).from(s.users).where(or(like(s.users.email, "%@test.local"), like(s.users.email, "%@demo.local")));
  let made = 0;
  for (const [i, u] of users.entries()) {
    const existing = await db.select({ id: s.photos.id }).from(s.photos).where(eq(s.photos.userId, u.id));
    if (existing.length && !process.argv.includes("--force")) continue;
    if (existing.length) await db.delete(s.photos).where(eq(s.photos.userId, u.id));
    const count = 2 + (i % 2);
    for (let v = 0; v < count; v++) {
      // Rendered at half resolution (filters are slow) then scaled up; the content is soft, so nothing is lost.
      const art = svg(i, v); // always generated, so the random sequence (and every image) stays the same
      const cacheFile = path.join(CACHE, `${createHash("sha1").update(art).digest("hex")}.webp`);
      let data: Buffer;
      try {
        data = await readFile(cacheFile); // re-seeding reuses rendered images (rendering is slow)
      } catch {
        const base = await sharp(Buffer.from(art), { density: 36 }).resize(1080, 1440).png().toBuffer();
        data = await sharp(base).composite([{ input: await grainLayer() }]).webp({ quality: 80 }).toBuffer();
        await mkdir(CACHE, { recursive: true });
        await writeFile(cacheFile, data);
      }
      const out = { data, info: { width: 1080, height: 1440 } };
      const tiny = await sharp(out.data).resize(32, 32, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const blurhash = encode(new Uint8ClampedArray(tiny.data), tiny.info.width, tiny.info.height, 4, 4);
      const key = `photos/${u.id}/${randomUUID()}.webp`;
      await mkdir(path.join(ROOT, path.dirname(key)), { recursive: true });
      await writeFile(path.join(ROOT, key), out.data);
      await db.insert(s.photos).values({ userId: u.id, storageKey: key, position: v, width: out.info.width, height: out.info.height, blurhash, quality: "GOOD", status: "LIVE" });
      made++;
      if (made % 20 === 0) console.log(`  ${made} photos…`);
    }
  }
  console.log(`Generated ${made} placeholder photos for ${users.length} test users.`);
}

if (!process.env.NO_MAIN) main().catch((e) => { console.error(e); process.exit(1); });
