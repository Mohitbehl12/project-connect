// Seeds plans, legal documents, config, staff accounts, two demo users and ~200 test users.
// All seeded people are fictional test data. Safe to re-run on an empty database.
import "./env";
import bcrypt from "bcryptjs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as s from "../src/db/schema";
import { CITIES, INTERESTS, PERSONALITY_QUESTIONS } from "../src/lib/constants";
import { DEFAULT_WEIGHTS, profileCompleteness } from "../src/lib/matching";

const db = drizzle(createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN || undefined }), { schema: s });

// Deterministic PRNG so every seed run produces the same people.
let seed = 20261008;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const pickN = <T,>(arr: readonly T[], n: number) => [...arr].sort(() => rand() - 0.5).slice(0, n);
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

const WOMEN = ["Aanya", "Ira", "Meera", "Kavya", "Diya", "Saanvi", "Tara", "Nisha", "Riya", "Anika", "Zoya", "Mira", "Priya", "Ishita", "Naina", "Emma", "Sofia", "Hana", "Leila", "Chloe", "Yuki", "Amelia", "Grace", "Lena"];
const MEN = ["Rohan", "Arjun", "Kabir", "Vivaan", "Aditya", "Dev", "Ishaan", "Karan", "Neil", "Sahil", "Aarav", "Reyansh", "Vikram", "Omar", "Liam", "Noah", "Kenji", "Lucas", "Ethan", "Leo", "Felix", "Ravi", "Samar", "Yash"];
const NB = ["Ari", "Sam", "Kiran", "Rumi", "Alex", "Noor"];
const PROFESSIONS = ["Product designer", "Software engineer", "Doctor", "Architect", "Teacher", "Lawyer", "Data analyst", "Chef", "Marketing lead", "Founder", "Journalist", "Physiotherapist", "Musician", "Consultant", "Civil engineer", "Researcher"];
const INDUSTRIES = ["Technology", "Healthcare", "Education", "Finance", "Media", "Hospitality", "Design", "Law", "Engineering", "Non-profit"];
const EDUCATION = ["Bachelor's degree", "Master's degree", "PhD", "Diploma", "Professional degree"];
const BIOS = [
  "Weekday spreadsheets, weekend trails. Looking for someone who laughs easily and plans the occasional surprise.",
  "I make a decent filter coffee and an excellent playlist. Tell me the last thing you were genuinely curious about.",
  "Recovering perfectionist. Learning to cook my grandmother's recipes one burnt attempt at a time.",
  "Happiest on a long walk with good conversation. I'll always say yes to a bookshop detour.",
  "Equal parts homebody and wanderer. My ideal Sunday has a slow breakfast and no alarms.",
  "Building something new at work and trying to be just as intentional about life outside it.",
  "Ask me about the best street food in my city — I've done the research so you don't have to.",
  "Kind, a little sarcastic, very loyal. Looking for something real, not a pen pal.",
];
const PROMPT_QS = ["A perfect first date for me is", "I'm quietly proud of", "The way to my heart is", "My friends would describe me as", "Something I'm learning right now"];
const PROMPT_AS = ["a long walk ending at a chai stall", "finally running a half marathon", "remembering the small things", "the one who always plans the trip", "Carnatic vocals, badly", "a museum we both pretend to understand", "my terrible puns", "baking sourdough that actually rises"];

async function main() {
  const now = new Date();
  console.log("Seeding plans…");
  const planDefs = [
    { code: "FREE", name: "Free", sortOrder: 0, features: { dailyLikes: 25, dailyPriorityLikes: 1, seeWhoLiked: false, advancedFilters: false, incognito: false, travelMode: false, monthlyBoosts: 0 } },
    { code: "PREMIUM", name: "Premium", sortOrder: 1, features: { dailyLikes: 100, dailyPriorityLikes: 3, seeWhoLiked: true, advancedFilters: true, incognito: false, travelMode: false, monthlyBoosts: 1 } },
    { code: "PREMIUM_PLUS", name: "Premium Plus", sortOrder: 2, features: { dailyLikes: -1, dailyPriorityLikes: 5, seeWhoLiked: true, advancedFilters: true, incognito: true, travelMode: true, monthlyBoosts: 2 } },
    { code: "VIP", name: "VIP", sortOrder: 3, features: { dailyLikes: -1, dailyPriorityLikes: 10, seeWhoLiked: true, advancedFilters: true, incognito: true, travelMode: true, monthlyBoosts: 5 } },
  ];
  // All prices are editable in Admin → Pricing. India uses price groups: men pay the "gender:MAN" price,
  // everyone else (women, non-binary, not stated) pays the "*" price. Groups only apply in countries
  // listed in billing.genderPricingCountries (IN by default) — they're unlawful in some places.
  const priceTable: Record<string, [string, string, number, string?][]> = {
    PREMIUM: [["IN", "INR", 10000, "gender:MAN"], ["IN", "INR", 5000], ["US", "USD", 1499], ["GB", "GBP", 1199], ["*", "USD", 1499]],
    PREMIUM_PLUS: [["IN", "INR", 24900, "gender:MAN"], ["IN", "INR", 14900], ["US", "USD", 2499], ["GB", "GBP", 1999], ["*", "USD", 2499]],
    VIP: [["IN", "INR", 99900, "gender:MAN"], ["IN", "INR", 59900], ["US", "USD", 4999], ["*", "USD", 4999]],
  };
  for (const p of planDefs) {
    const [plan] = await db.insert(s.plans).values({ ...p, features: JSON.stringify(p.features) }).returning();
    for (const [country, currency, amountMinor, segment] of priceTable[p.code] ?? [])
      await db.insert(s.planPrices).values({ planId: plan.id, country, currency, amountMinor, durationDays: 30, segment: segment ?? "*" });
  }

  console.log("Seeding offers and coupons…");
  await db.insert(s.offers).values([
    { name: "Welcome ₹1 — men", kind: "INTRO", headline: "Try Premium for ₹1", badge: "Welcome offer", planCode: "PREMIUM", country: "IN", genders: "MAN", audience: "NEW", priceMinor: 100, days: 15, priority: 10 },
    { name: "Welcome ₹1 — everyone else", kind: "INTRO", headline: "Try Premium for ₹1", badge: "Welcome offer", planCode: "PREMIUM", country: "IN", genders: "", audience: "NEW", priceMinor: 100, days: 30, priority: 10 },
    { name: "Welcome back", kind: "DISCOUNT", headline: "Welcome back — 40% off your first month", badge: "Welcome back", planCode: "PREMIUM", country: "IN", audience: "RETURNING", discountPct: 40, priority: 5 },
    { name: "Weekend Dating Pass", kind: "PASS", headline: "Weekend Dating Pass", badge: "3 days", planCode: "PREMIUM", country: "IN", priceMinor: 4900, days: 3, oncePerUser: false, priority: 1 },
    { name: "Diwali Special 2026", kind: "DISCOUNT", headline: "Diwali Special — 50% off your first month", badge: "Festival offer", planCode: "PREMIUM", country: "IN", discountPct: 50, priority: 20, startsAt: new Date("2026-11-01T00:00:00+05:30"), endsAt: new Date("2026-11-12T00:00:00+05:30"), active: false },
  ]);
  await db.insert(s.coupons).values([
    { code: "WELCOME50", kind: "PERCENT", value: 50, maxDiscountMinor: 5000, audience: "NEW" },
    { code: "FIRSTDATE", kind: "FIXED", value: 2000, currency: "INR", countries: "IN" },
    { code: "LOVE2026", kind: "PERCENT", value: 25, endsAt: new Date("2027-01-01T00:00:00+05:30"), usageLimit: 1000 },
    { code: "FESTIVAL50", kind: "PERCENT", value: 50, maxDiscountMinor: 10000, active: false },
  ]);

  console.log("Seeding config and legal documents…");
  await db.insert(s.appConfig).values({ key: "matching.weights", value: JSON.stringify(DEFAULT_WEIGHTS) });
  const docs = [
    ["terms", "Terms of Service", true], ["privacy", "Privacy Policy", true], ["guidelines", "Community Guidelines", true],
    ["safety", "Safety Policy", true], ["payments", "Payment Terms", false], ["refunds", "Cancellation & Refund Policy", false], ["cookies", "Cookie Policy", false],
  ] as const;
  for (const [slug, title, required] of docs) {
    const [doc] = await db.insert(s.legalDocuments).values({ slug, title, requiredAtSignup: required }).returning();
    await db.insert(s.legalVersions).values({
      documentId: doc.id, version: 1, status: "PUBLISHED", publishedAt: now, effectiveAt: now,
      body: `# ${title}\n\n**Placeholder text for testing — this is not legal advice.** Have a lawyer draft the real ${title.toLowerCase()} for each country you launch in (including India's DPDP Act 2023 and GDPR for EU/UK users) before going live.\n\n## Summary\n\nThis section will explain, in plain language, what this document covers and how it affects people using Project Connect.`,
    });
  }

  console.log("Seeding staff accounts…");
  const staffPw = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026", 12);
  await db.insert(s.users).values([
    { email: (process.env.SEED_ADMIN_EMAIL ?? "admin@projectconnect.local").toLowerCase(), passwordHash: staffPw, role: "SUPER_ADMIN", emailVerified: true, onboardingStep: 3 },
    { email: "moderator@projectconnect.local", passwordHash: staffPw, role: "MODERATOR", emailVerified: true, onboardingStep: 3 },
    { email: "support@projectconnect.local", passwordHash: staffPw, role: "SUPPORT", emailVerified: true, onboardingStep: 3 },
    { email: "finance@projectconnect.local", passwordHash: staffPw, role: "FINANCE", emailVerified: true, onboardingStep: 3 },
    { email: "finance2@projectconnect.local", passwordHash: staffPw, role: "FINANCE", emailVerified: true, onboardingStep: 3 },
    { email: "security@projectconnect.local", passwordHash: staffPw, role: "SECURITY", emailVerified: true, onboardingStep: 3 },
  ]);

  console.log("Seeding test users…");
  const demoPw = await bcrypt.hash("Demo!2026", 10);
  const interestKeys = Object.keys(INTERESTS);
  const cityWeights: [string, number][] = [
    ["Delhi", 40], ["Gurugram", 18], ["Noida", 14], ["Mumbai", 22], ["Bengaluru", 22], ["Pune", 8], ["Hyderabad", 8],
    ["London", 10], ["New York", 8], ["Dubai", 6], ["Singapore", 6], ["Toronto", 4], ["Sydney", 4],
  ];
  const cityPool = cityWeights.flatMap(([c, w]) => Array(w).fill(c) as string[]);

  type Spec = { email: string; first: string; gender: string; city: string; age: number; interestedIn: string; demo?: boolean };
  const specs: Spec[] = [
    { email: "aanya@demo.local", first: "Aanya", gender: "WOMAN", city: "Delhi", age: 27, interestedIn: "MAN", demo: true },
    { email: "rohan@demo.local", first: "Rohan", gender: "MAN", city: "Delhi", age: 29, interestedIn: "WOMAN", demo: true },
  ];
  for (let i = 0; i < 200; i++) {
    const r = rand();
    const gender = r < 0.47 ? "WOMAN" : r < 0.94 ? "MAN" : "NONBINARY";
    const first = gender === "WOMAN" ? pick(WOMEN) : gender === "MAN" ? pick(MEN) : pick(NB);
    const interestedIn = gender === "NONBINARY" ? "WOMAN,MAN,NONBINARY" : rand() < 0.9 ? (gender === "WOMAN" ? "MAN" : "WOMAN") : "WOMAN,MAN,NONBINARY";
    specs.push({ email: `user${i + 1}@test.local`, first, gender, city: pick(cityPool), age: int(21, 38), interestedIn });
  }

  const intents = ["MARRIAGE", "LONG_TERM", "LONG_TERM", "LONG_TERM_OPEN", "FIGURING_OUT", "CASUAL", "FRIENDS"];
  const ids: string[] = [];
  const requiredVersions = (await db.select({ id: s.legalVersions.id, req: s.legalDocuments.requiredAtSignup })
    .from(s.legalVersions).innerJoin(s.legalDocuments, eq(s.legalDocuments.id, s.legalVersions.documentId))).filter((v) => v.req).map((v) => v.id);
  for (const sp of specs) {
    const c = CITIES[sp.city];
    const dob = new Date(Date.UTC(now.getUTCFullYear() - sp.age, int(0, 11), int(1, 28))).toISOString().slice(0, 10);
    const verified = sp.demo || rand() < 0.55;
    const [u] = await db.insert(s.users).values({
      email: sp.email, dob, passwordHash: demoPw, emailVerified: true, phoneVerified: rand() < 0.6,
      selfieStatus: verified ? "VERIFIED" : rand() < 0.15 ? "PENDING" : "NONE", onboardingStep: 3,
      lastActiveAt: new Date(now.getTime() - int(0, 72) * 3600_000),
    }).returning();
    ids.push(u.id);
    await db.insert(s.legalAcceptances).values(requiredVersions.map((versionId) => ({ userId: u.id, versionId, ip: "seed" })));
    const interests = pickN(interestKeys, int(3, 7));
    const prompts = pickN(PROMPT_QS, int(1, 3)).map((q) => ({ q, a: pick(PROMPT_AS) }));
    const answers = PERSONALITY_QUESTIONS.map((q) => ({ userId: u.id, questionKey: q.key, value: int(1, 5) }));
    const lifestyle = {
      drinking: pick(["NEVER", "SOCIAL", "SOCIAL", "REGULAR"]), smoking: pick(["NEVER", "NEVER", "NEVER", "SOCIAL"]),
      food: pick(["VEG", "NONVEG", "NONVEG", "EGGETARIAN", "ANY", "VEGAN"]), exercise: pick(["RARELY", "SOMETIMES", "OFTEN"]),
      pets: pick(["HAS", "WANTS", "NONE"]),
    };
    const extras = { education: pick(EDUCATION), profession: pick(PROFESSIONS), heightCm: sp.gender === "MAN" ? int(165, 190) : int(152, 178) };
    const bio = pick(BIOS);
    await db.insert(s.profiles).values({
      userId: u.id, firstName: sp.first, dob, gender: sp.gender, bio, country: c.country, city: sp.city,
      lat: c.lat + (rand() - 0.5) * 0.18, lng: c.lng + (rand() - 0.5) * 0.18,
      ...extras, industry: pick(INDUSTRIES), ...lifestyle, intent: sp.demo ? "LONG_TERM" : pick(intents),
      interests: interests.join(","), prompts: JSON.stringify(prompts),
      completeness: profileCompleteness({ bio, photos: [], ...extras, ...lifestyle, interests, prompts, answerCount: answers.length }),
    });
    await db.insert(s.preferences).values({
      userId: u.id, interestedIn: sp.interestedIn, ageMin: Math.max(18, sp.age - 5), ageMax: sp.age + 6,
      maxDistanceKm: sp.city === "Delhi" || sp.city === "Gurugram" || sp.city === "Noida" ? 60 : 40,
    });
    await db.insert(s.personalityAnswers).values(answers);
  }

  // A few people have already liked the demo users so "Likes you" has content.
  const [aanyaId, rohanId] = ids;
  const delhiMen = specs.map((sp, i) => ({ sp, id: ids[i] })).filter((x) => !x.sp.demo && x.sp.gender === "MAN" && ["Delhi", "Gurugram", "Noida"].includes(x.sp.city) && x.sp.interestedIn.includes("WOMAN"));
  const delhiWomen = specs.map((sp, i) => ({ sp, id: ids[i] })).filter((x) => !x.sp.demo && x.sp.gender === "WOMAN" && ["Delhi", "Gurugram", "Noida"].includes(x.sp.city) && x.sp.interestedIn.includes("MAN"));
  for (const x of delhiMen.slice(0, 4)) await db.insert(s.likes).values({ fromId: x.id, toId: aanyaId, kind: "LIKE" });
  for (const x of delhiWomen.slice(0, 4)) await db.insert(s.likes).values({ fromId: x.id, toId: rohanId, kind: x === delhiWomen[0] ? "PRIORITY" : "LIKE", note: x === delhiWomen[0] ? "Your trek photos convinced me — where was the last one?" : null });

  console.log(`Done. ${specs.length} users seeded.`);
  console.log("Demo logins (password Demo!2026): aanya@demo.local, rohan@demo.local");
  console.log(`Admin: ${process.env.SEED_ADMIN_EMAIL ?? "admin@projectconnect.local"} (password from SEED_ADMIN_PASSWORD)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
