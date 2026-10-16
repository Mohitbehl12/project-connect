// Sample matches and conversations for testing (fictional people only).
//
// Runs on every start when SEED_SAMPLE_USERS=true (see scripts/bootstrap.ts), and does nothing when the
// sample data is already there. It:
//   1. adds the fictional sample people (emails @test.local / @demo.local) if the database has none,
//   2. gives the two demo accounts (aanya@demo.local, rohan@demo.local) several matches with chats,
//      a few unread messages and some still waiting for a first message,
//   3. matches the two demo accounts with each other, so you can chat and call between two phones,
//   4. optionally does the same for real accounts listed in SAMPLE_MATCHES_FOR (comma-separated emails,
//      accounts that have finished sign-up), so you can test with your own account.
// Remove all of it before a public launch: npm run db:remove-samples (and set SEED_SAMPLE_USERS=false).
import "./env";
import { execSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { and, eq, inArray, like, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import * as s from "../src/db/schema";
import { seal } from "../src/lib/crypto";

const db = drizzle(createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN || undefined }), { schema: s });

// Original, made-up conversations. "me" = the account being set up, "them" = the sample person.
type Line = ["me" | "them", string];
const CHATS: Line[][] = [
  [["them", "Hi! Your photo from the hills — was that Kasol?"], ["me", "Close! Tosh, a bit further up. Have you been?"], ["them", "Not yet, it's on my list for spring 🌸"], ["me", "Go in April, the snow is just melting"], ["them", "Noted. Any café you'd recommend there?"]],
  [["me", "Hey, I see you're into board games too"], ["them", "Guilty 😄 Catan or Codenames?"], ["me", "Codenames, always. Catan ends friendships"], ["them", "Haha true. There's a board game café in Hauz Khas, have you tried it?"]],
  [["them", "Okay important question: chai or coffee?"], ["me", "Cutting chai, no contest"], ["them", "Correct answer ☕"], ["me", "What about you?"], ["them", "Filter coffee in the morning, chai after 4. I contain multitudes"], ["me", "That's very reasonable actually"]],
  [["me", "Your bio says you're learning the guitar — how's it going?"], ["them", "Three chords in and my neighbours already hate me 😅"], ["me", "Every legend starts there"]],
  [["them", "Hello! I liked your answer about the perfect first date"], ["me", "Thank you! Long walk + chai is undefeated"], ["them", "Lodhi Garden on a Sunday morning?"]],
  [["them", "Hi 👋 how's your week going?"]],
];
const REASONS = [
  ["Looking for the same kind of relationship", "You both enjoy trekking and coffee"],
  ["Compatible relationship goals", "You both enjoy board games and reading"],
  ["You both enjoy travel and food", "Similar weekend pace"],
  ["Looking for the same kind of relationship", "You both like slow, planned dates"],
];
const PAIR_CHAT: Line[] = [["them", "Hi! This is a test chat between the two demo accounts."], ["me", "Works! Try sending a message or a call from the other phone."]];

const hour = 3_600_000;
const ordered = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

async function ensureMatch(meId: string, otherId: string, i: number, lines: Line[] | null, daysAgo: number) {
  const [a, b] = ordered(meId, otherId);
  const existing = await db.query.matches.findFirst({ where: and(eq(s.matches.userAId, a), eq(s.matches.userBId, b)) });
  if (existing) return false;
  const start = Date.now() - daysAgo * 24 * hour;
  for (const [from, to] of [[meId, otherId], [otherId, meId]])
    await db.insert(s.likes).values({ fromId: from, toId: to, kind: "LIKE", createdAt: new Date(start - hour) }).onConflictDoNothing();
  const [m] = await db.insert(s.matches).values({ userAId: a, userBId: b, score: 72 + ((i * 7) % 21), reasons: JSON.stringify(REASONS[i % REASONS.length]), createdAt: new Date(start) }).returning();
  let t = start + 20 * 60_000;
  for (const [k, [who, text]] of (lines ?? []).entries()) {
    const last = k === (lines?.length ?? 0) - 1;
    const sender = who === "me" ? meId : otherId;
    // The last message from the other person stays unread so the "new message" badge shows.
    const read = !(last && who === "them");
    await db.insert(s.messages).values({ matchId: m.id, senderId: sender, body: seal(text, m.id), createdAt: new Date(t), readAt: read ? new Date(t + 5 * 60_000) : null });
    t += (7 + k * 11) * 60_000;
  }
  return true;
}

async function setUp(meId: string, label: string) {
  const me = await db.query.profiles.findFirst({ where: eq(s.profiles.userId, meId) });
  const prefs = await db.query.preferences.findFirst({ where: eq(s.preferences.userId, meId) });
  if (!me || !prefs) { console.log(`[sample-data] ${label}: no finished profile yet — skipped`); return; }
  const wanted = prefs.interestedIn.split(",").filter(Boolean);
  const pool = await db.select({ id: s.users.id, name: s.profiles.firstName, gender: s.profiles.gender, city: s.profiles.city, interestedIn: s.preferences.interestedIn, verified: s.users.selfieStatus })
    .from(s.users).innerJoin(s.profiles, eq(s.profiles.userId, s.users.id)).innerJoin(s.preferences, eq(s.preferences.userId, s.users.id))
    .where(and(like(s.users.email, "%@test.local"), ne(s.users.id, meId)));
  const near = ["Delhi", "Gurugram", "Noida"].includes(me.city ?? "") ? ["Delhi", "Gurugram", "Noida"] : [me.city ?? ""];
  const fits = pool.filter((p) => wanted.includes(p.gender) && p.interestedIn.split(",").includes(me.gender))
    .sort((x, y) => Number(near.includes(y.city)) - Number(near.includes(x.city)) || Number(y.verified === "VERIFIED") - Number(x.verified === "VERIFIED"))
    // Different first names (and not the demo accounts' names), so chats are easy to tell apart.
    .filter((p, i, all) => p.name !== "Aanya" && p.name !== "Rohan" && p.name !== me.firstName && all.findIndex((q) => q.name === p.name) === i);
  const already = await db.select({ id: s.matches.id }).from(s.matches).where(or(eq(s.matches.userAId, meId), eq(s.matches.userBId, meId)));
  if (already.length >= 5) { console.log(`[sample-data] ${label}: already has ${already.length} matches — left as is`); return; }
  let made = 0;
  for (const [i, p] of fits.slice(0, 8).entries()) {
    // 6 chats, then 2 brand-new matches with no messages ("say hello").
    if (await ensureMatch(meId, p.id, i, i < CHATS.length ? CHATS[i] : null, i < CHATS.length ? 6 - i : 0.1)) made++;
  }
  // A few more people who have liked this account but aren't matched yet ("Likes you").
  for (const p of fits.slice(8, 12)) await db.insert(s.likes).values({ fromId: p.id, toId: meId, kind: "LIKE" }).onConflictDoNothing();
  console.log(`[sample-data] ${label}: ${made} matches added`);
}

async function main() {
  const samples = await db.select({ id: s.users.id }).from(s.users).where(or(like(s.users.email, "%@test.local"), like(s.users.email, "%@demo.local"))).limit(1);
  if (!samples.length) {
    console.log("[sample-data] adding fictional sample people…");
    execSync("npx tsx scripts/seed.ts", { stdio: "inherit", env: { ...process.env, SEED_PEOPLE_ONLY: "true", SEED_SAMPLE_COUNT: process.env.SEED_SAMPLE_COUNT ?? "120" } });
  }
  const demos = await db.select({ id: s.users.id, email: s.users.email }).from(s.users).where(inArray(s.users.email, ["aanya@demo.local", "rohan@demo.local"]));
  for (const d of demos) await setUp(d.id, d.email);
  const aanya = demos.find((d) => d.email.startsWith("aanya")), rohan = demos.find((d) => d.email.startsWith("rohan"));
  if (aanya && rohan && (await ensureMatch(rohan.id, aanya.id, 0, PAIR_CHAT, 0.05))) console.log("[sample-data] demo accounts matched with each other");

  const extra = (process.env.SAMPLE_MATCHES_FOR ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  for (const email of extra) {
    const u = await db.query.users.findFirst({ where: eq(s.users.email, email) });
    if (u) await setUp(u.id, "an account from SAMPLE_MATCHES_FOR");
    else console.log("[sample-data] an account in SAMPLE_MATCHES_FOR doesn't exist yet — skipped");
  }
}

main().catch((e) => { console.error("[sample-data] failed:", e); process.exit(1); });
