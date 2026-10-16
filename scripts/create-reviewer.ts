// Creates (or resets) the demo account Apple and Google reviewers sign in with.
//
//   npm run reviewer:create -- appreview@yourbrand.in
//
// Prints a new random password ONCE: paste the email and password into App Store Connect (App Review
// Information → Sign-in required) and Play Console (App content → App access). Run it again to change the
// password. The account is a finished, verified profile (man looking for women, Delhi) so review can start
// at Discover. Reviewers need other profiles to see: launch with real members or keep a few test profiles.
import "./env";
import { randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as s from "../src/db/schema";
import { CITIES, PERSONALITY_QUESTIONS } from "../src/lib/constants";

async function main() {
  const email = (process.argv[2] ?? process.env.REVIEWER_EMAIL ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Give the reviewer's email: npm run reviewer:create -- appreview@yourbrand.in");
  const client = createClient({ url: process.env.DATABASE_URL ?? "file:./data/dev.db", authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  const db = drizzle(client, { schema: s });
  const argon2 = await import("@node-rs/argon2");
  const password = `Rv-${randomBytes(9).toString("base64url")}9`;
  const passwordHash = await argon2.hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const existing = await db.query.users.findFirst({ where: eq(s.users.email, email) });
  if (existing) {
    await db.update(s.users).set({ passwordHash, failedLogins: 0, lockedUntil: null, tokenVersion: existing.tokenVersion + 1, totpSecret: null, status: "ACTIVE" }).where(eq(s.users.id, existing.id));
    console.log(`✓ Reset the reviewer account ${email}`);
  } else {
    const dob = `${new Date().getUTCFullYear() - 29}-03-15`;
    const [u] = await db.insert(s.users).values({ email, dob, passwordHash, emailVerified: true, selfieStatus: "VERIFIED", onboardingStep: 3, welcomeGiftAt: new Date() }).returning();
    const versions = await db.select({ id: s.legalVersions.id, req: s.legalDocuments.requiredAtSignup }).from(s.legalVersions)
      .innerJoin(s.legalDocuments, eq(s.legalDocuments.id, s.legalVersions.documentId));
    const required = versions.filter((v) => v.req).map((v) => ({ userId: u.id, versionId: v.id, ip: "reviewer-script" }));
    if (required.length) await db.insert(s.legalAcceptances).values(required);
    const c = CITIES.Delhi;
    await db.insert(s.profiles).values({
      userId: u.id, firstName: "Review", dob, gender: "MAN", bio: "Demo account for app review.", country: c.country, city: "Delhi", lat: c.lat, lng: c.lng,
      intent: "LONG_TERM", interests: "travel,music_live,coffee", prompts: JSON.stringify([{ q: "A perfect Sunday", a: "A long walk and good coffee." }]), completeness: 70,
    });
    await db.insert(s.preferences).values({ userId: u.id, interestedIn: "WOMAN", ageMin: 21, ageMax: 40, maxDistanceKm: 100 });
    await db.insert(s.personalityAnswers).values(PERSONALITY_QUESTIONS.map((q) => ({ userId: u.id, questionKey: q.key, value: 3 })));
    console.log(`✓ Created the reviewer account ${email}`);
  }
  console.log(`  Password (shown once): ${password}`);
  client.close();
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
