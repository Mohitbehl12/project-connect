// Gives every seeded test user 2–3 generated placeholder "portraits": abstract silhouettes on
// brand-colour gradients. They are deliberately NOT photos of people — real users upload their own.
// Local storage driver only. Run after the main seed: npm run db:seed-photos
import "./env";
import sharp from "sharp";
import { encode } from "blurhash";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, like, or } from "drizzle-orm";
import * as s from "../src/db/schema";

const db = drizzle(createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN || undefined }), { schema: s });
const ROOT = path.resolve("data", "uploads");

const PALETTES = [
  ["#2E2A6E", "#6C5CE7", "#F2A93B"], ["#C8406A", "#F2A93B", "#FDF0DA"], ["#4F8270", "#9CC9B5", "#F7F6FB"],
  ["#1C1B3A", "#C8406A", "#F5B656"], ["#6C5CE7", "#C8406A", "#FDE3EA"], ["#C9821A", "#F2A93B", "#2E2A6E"],
  ["#12112A", "#4F8270", "#F2A93B"], ["#8F88F0", "#F7F6FB", "#2E2A6E"],
];
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function svg(i: number, variant: number) {
  const [a, b, c] = PALETTES[(i + variant * 3) % PALETTES.length];
  const ang = Math.floor(rand() * 360);
  const hx = 540 + (rand() - 0.5) * 160, hy = 600 + (rand() - 0.5) * 80; // head centre
  const r = 150 + rand() * 30;
  const arcR = 380 + rand() * 120;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${ang} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <radialGradient id="glow" cx="${hx / 1080}" cy="${(hy - 120) / 1440}" r=".6"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1080" height="1440" fill="url(#g)"/>
  <rect width="1080" height="1440" fill="url(#glow)"/>
  <circle cx="${hx}" cy="${hy}" r="${arcR}" fill="none" stroke="${c}" stroke-opacity=".35" stroke-width="18" stroke-dasharray="${arcR * 2.2} ${arcR * 4}" transform="rotate(${ang} ${hx} ${hy})"/>
  <circle cx="${hx}" cy="${hy}" r="${r}" fill="#ffffff" fill-opacity=".22"/>
  <path d="M${hx - 330} 1440 C ${hx - 320} ${hy + 260}, ${hx + 320} ${hy + 260}, ${hx + 330} 1440 Z" fill="#ffffff" fill-opacity=".18"/>
</svg>`;
}

async function main() {
  const users = await db.select({ id: s.users.id }).from(s.users).where(or(like(s.users.email, "%@test.local"), like(s.users.email, "%@demo.local")));
  let made = 0;
  for (const [i, u] of users.entries()) {
    const existing = await db.select({ id: s.photos.id }).from(s.photos).where(eq(s.photos.userId, u.id));
    if (existing.length) continue;
    const count = 2 + (i % 2);
    for (let v = 0; v < count; v++) {
      const out = await sharp(Buffer.from(svg(i, v))).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
      const tiny = await sharp(out.data).resize(32, 32, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const blurhash = encode(new Uint8ClampedArray(tiny.data), tiny.info.width, tiny.info.height, 4, 4);
      const key = `photos/${u.id}/${randomUUID()}.webp`;
      await mkdir(path.join(ROOT, path.dirname(key)), { recursive: true });
      await writeFile(path.join(ROOT, key), out.data);
      await db.insert(s.photos).values({ userId: u.id, storageKey: key, position: v, width: out.info.width, height: out.info.height, blurhash, quality: "GOOD", status: "LIVE" });
      made++;
    }
  }
  console.log(`Generated ${made} placeholder photos for ${users.length} test users.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
