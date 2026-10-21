import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { and, count, countDistinct, eq, gte, inArray, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { audit } from "./audit";
import { countryRules } from "./compliance";
import { getConfig } from "./config";
import { CITIES, COUNTRIES, GENDERS, INTERESTS } from "./constants";
import { ApiError } from "./http";
import { ageFromDob } from "./matching";
import { screenMessage } from "./moderation";
import { storage } from "./storage";

// Kinara Ads. Principles (see legal/advertising.md):
//  • every ad is labelled "Sponsored" and looks different from member profiles;
//  • advertisers only ever see aggregated numbers — never who saw or clicked an ad;
//  • targeting uses location, age band and device; gender and interests only when personalised ads are on
//    for that member; never who someone wants to date, their intent, messages, calls or anything sensitive;
//  • nothing goes live without automated checks plus a person's approval, and a verified advertiser;
//  • ads never appear inside a conversation or during a call.

export const OBJECTIVES = {
  AWARENESS: "Brand awareness", WEBSITE: "Website visits", APP: "App downloads", PRODUCT: "Product promotion",
  LEADS: "Lead generation", EVENT: "Event promotion", STORE: "Store visits", BUSINESS: "Profile / business promotion",
} as const;
export const CTAS = {
  LEARN_MORE: "Learn more", SHOP_NOW: "Shop now", BOOK_NOW: "Book now", DOWNLOAD: "Download", CONTACT: "Contact us",
  VISIT: "Visit website", GET_OFFER: "Get offer", SIGN_UP: "Sign up",
} as const;
export const PLACEMENTS = {
  DISCOVER: "Discover — a sponsored card between profiles",
  FEED: "Explore feed — a sponsored card",
  STORY: "Story — full-screen vertical ad in Explore",
  BANNER: "Banner — small banner on Matches and Likes (never in chats)",
  RECOMMENDATION: "Sponsored recommendation in Explore",
  HOME: "Website homepage banner",
} as const;
export type Placement = keyof typeof PLACEMENTS;
export const PRICING = { CPM: "Per 1,000 views (CPM)", CPC: "Per click (CPC)", CPA: "Per action (CPA)", FIXED: "Fixed placement (per day)" } as const;
export const AD_CATEGORIES = {
  FASHION: "Fashion & beauty", FOOD: "Restaurants & cafés", SALON: "Salons & wellness", TRAVEL: "Travel & hotels", EVENTS: "Events & nightlife",
  RETAIL: "Shopping & retail", APPS: "Apps & tech", EDUCATION: "Education", LOCAL: "Local services", FITNESS: "Fitness", ENTERTAINMENT: "Entertainment",
  FINANCE: "Finance (regulated)", HEALTH: "Health (regulated)", ALCOHOL: "Alcohol (regulated)", DATING: "Dating & relationships (regulated)", OTHER: "Other",
} as const;
export const REGULATED = ["FINANCE", "HEALTH", "ALCOHOL", "DATING"];
export const REPORT_REASONS = {
  MISLEADING: "Misleading", SCAM: "Scam", OFFENSIVE: "Offensive", INAPPROPRIATE: "Inappropriate", FAKE_BUSINESS: "Fake business",
  DANGEROUS: "Dangerous", MISMATCH: "Doesn't match the website", OTHER: "Other",
} as const;
export const CAMPAIGN_STATUS = ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "ACTIVE", "PAUSED", "COMPLETED"] as const;
export const GENERAL_REJECTION = "Your advertisement could not be approved because it does not meet our advertising guidelines.";

/** Regions people think in ("Delhi NCR") mapped to our cities. */
export const REGIONS: Record<string, string[]> = {
  "Delhi NCR": ["Delhi", "Gurugram", "Noida"], Maharashtra: ["Mumbai", "Pune"], Karnataka: ["Bengaluru"], Telangana: ["Hyderabad"],
  "Tamil Nadu": ["Chennai"], "West Bengal": ["Kolkata"], Rajasthan: ["Jaipur"],
};

const keysOf = <T extends object>(o: T) => Object.keys(o) as [string, ...string[]];
export const Targeting = z.object({
  countries: z.array(z.enum(keysOf(COUNTRIES))).max(30).default([]),
  regions: z.array(z.enum(keysOf(REGIONS))).max(20).default([]),
  cities: z.array(z.enum(keysOf(CITIES))).max(40).default([]),
  ageMin: z.number().int().min(18).max(99).default(18),
  ageMax: z.number().int().min(18).max(99).default(99),
  genders: z.array(z.enum(keysOf(GENDERS))).max(3).default([]),
  interests: z.array(z.enum(keysOf(INTERESTS))).max(10).default([]),
  devices: z.array(z.enum(["ios", "android", "web"])).max(3).default([]),
  languages: z.array(z.enum(["en", "hi"])).max(2).default([]),
}).refine((t) => t.ageMin <= t.ageMax, { message: "Minimum age can't be above maximum age.", path: ["ageMin"] });
export type Targeting = z.infer<typeof Targeting>;

export const Creative = z.object({
  headline: z.string().trim().min(3).max(60),
  description: z.string().trim().max(160).default(""),
  cta: z.enum(keysOf(CTAS)).default("LEARN_MORE"),
  url: z.string().trim().max(500).default(""),
  logoKey: z.string().max(200).nullable().default(null),
  imageKeys: z.array(z.string().max(200)).max(5).default([]),
  videoKey: z.string().max(200).nullable().default(null),
});
export type Creative = z.infer<typeof Creative>;

export const parseTargeting = (s: string): Targeting => { try { return Targeting.parse(JSON.parse(s)); } catch { return Targeting.parse({}); } };
export const parseCreative = (s: string): Creative => { try { return Creative.parse(JSON.parse(s)); } catch { return { headline: "Ad", description: "", cta: "LEARN_MORE", url: "", logoKey: null, imageKeys: [], videoKey: null }; } };
const today = () => new Date().toISOString().slice(0, 10);

export async function requireAdvertiser(user: User) {
  const a = await db.query.advertisers.findFirst({ where: eq(schema.advertisers.userId, user.id) });
  if (!a) throw new ApiError(403, "This is for advertiser accounts. Create one at /advertise.", "not_advertiser");
  return a;
}

// ---- automated checks ----------------------------------------------------------------------------------
const PROHIBITED: [RegExp, string][] = [
  [/\b(guaranteed (returns?|profit|income)|double your money|get rich|risk[- ]free investment|ponzi|pyramid)\b/i, "Fake financial scheme"],
  [/\b(escort|call girls?|sex chat|hookup service|nude|xxx|porn|onlyfans)\b/i, "Sexual services or explicit content"],
  [/\b(cocaine|heroin|mdma|meth|weed delivery|ganja|charas|lsd)\b/i, "Illegal drugs"],
  [/\b(guns?|pistols?|rifles?|ammo|ammunition|explosives?)\b.{0,20}\b(for sale|buy|order)\b/i, "Weapons"],
  [/\b(replica|first copy|1st copy|counterfeit|fake (brand|watch|bag)s?)\b/i, "Counterfeit goods"],
  [/\b(miracle cure|cures? (cancer|diabetes|covid)|lose \d+ ?kg in \d+ days?)\b/i, "Misleading health claims"],
  [/\b(free (iphone|money)|you('| ha)ve won|claim your prize|lottery winner)\b/i, "Misleading claims / scam"],
  [/\b(betting|casino|satta|matka|rummy for cash)\b/i, "Gambling (not accepted)"],
  [/\b(hack(ed)? accounts?|crack(ed)? software|spy on (your )?(partner|wife|husband|girlfriend|boyfriend))\b/i, "Malware / stalkerware"],
];
const SHORTENERS = /(^|\.)(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy|shorturl\.at|tiny\.cc|ow\.ly|rebrand\.ly)$/i;

export function checkUrl(url: string): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return "The website address isn't valid."; }
  if (u.protocol !== "https:") return "The website must use https://.";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname) || u.hostname.includes(":")) return "Use a domain name, not an IP address.";
  if (u.hostname.startsWith("xn--") || u.hostname.includes(".xn--")) return "Internationalised (punycode) domains need manual approval.";
  if (SHORTENERS.test(u.hostname)) return "Link shorteners aren't allowed — use the real address.";
  if (/(^|\.)(localhost|local|internal|onion)$/.test(u.hostname)) return "That address can't be reached by members.";
  if (u.username || u.password) return "Addresses with login details aren't allowed.";
  return null;
}

/** Automated review. Hard problems reject at once (with a general reason); anything else goes to a person. */
export function autoCheck(c: { name: string; creative: Creative; category: string }) {
  const text = [c.name, c.creative.headline, c.creative.description].join("\n");
  const hard: string[] = [], soft: string[] = [];
  for (const [re, why] of PROHIBITED) if (re.test(text)) hard.push(why);
  const flags = screenMessage(text);
  if (flags.includes("SCAM") || flags.includes("FINANCIAL_INFO")) hard.push("Scam-like wording");
  if (flags.includes("THREAT") || flags.includes("ABUSE")) hard.push("Abusive or threatening text");
  if (flags.includes("RISKY_LINK")) hard.push("Risky link in the text");
  if (flags.includes("CONTACT_INFO")) soft.push("Phone number or email in the ad text");
  const urlProblem = checkUrl(c.creative.url);
  if (urlProblem) hard.push(urlProblem);
  if (REGULATED.includes(c.category)) soft.push(`Regulated category: ${AD_CATEGORIES[c.category as keyof typeof AD_CATEGORIES]} — check licences and claims`);
  if (/\b(100%|best in (india|the world)|no\.? ?1|guaranteed)\b/i.test(text)) soft.push("Superlative or guarantee claim — check it can be supported");
  return { hard, soft };
}

// ---- who sees what --------------------------------------------------------------------------------------
export function viewerHash(userId: string) {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`ads:${userId}`).digest("hex").slice(0, 24);
}

type Viewer = { userId: string; hash: string; country: string; city: string; age: number | null; gender: string | null; interests: string[]; device: string; language: string; personalised: boolean };

export async function viewerFor(user: User, device: string, language: string): Promise<Viewer | null> {
  const [p, prefs] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(schema.profiles.userId, user.id) }),
    db.query.preferences.findFirst({ where: eq(schema.preferences.userId, user.id) }),
  ]);
  if (!p) return null;
  const personalised = prefs?.personalisedAds ?? (await countryRules(p.country)).personalisedAdsDefault;
  return {
    userId: user.id, hash: viewerHash(user.id), country: p.country, city: p.city, age: ageFromDob(p.dob), device, language,
    gender: personalised ? p.gender : null, interests: personalised ? p.interests.split(",").filter(Boolean) : [], personalised,
  };
}

export function matchesTargeting(t: Targeting, v: Pick<Viewer, "country" | "city" | "age" | "gender" | "interests" | "device" | "language" | "personalised">) {
  const cities = new Set([...t.cities, ...t.regions.flatMap((r) => REGIONS[r] ?? [])]);
  if (t.countries.length && !t.countries.includes(v.country)) return false;
  if (cities.size && !cities.has(v.city)) return false;
  if (v.age !== null && (v.age < t.ageMin || v.age > t.ageMax)) return false;
  // Gender and interests are personal: only usable when the member has personalised ads on.
  if (t.genders.length && (!v.personalised || !v.gender || !t.genders.includes(v.gender))) return false;
  if (t.interests.length && (!v.personalised || !t.interests.some((i) => v.interests.includes(i)))) return false;
  if (t.devices.length && !(t.devices as string[]).includes(v.device)) return false;
  if (t.languages.length && !(t.languages as string[]).includes(v.language)) return false;
  return true;
}

/** "Why am I seeing this?" — only the broad reasons this member matched, nothing sensitive. */
export function whyText(businessName: string, t: Targeting, v: Pick<Viewer, "personalised" | "city" | "interests">) {
  const parts: string[] = [];
  const cities = [...t.cities, ...t.regions];
  if (cities.length) parts.push(`people in ${t.regions.find((r) => REGIONS[r]?.includes(v.city)) ?? v.city}`);
  else if (t.countries.length) parts.push("people in your country");
  if (t.ageMin > 18 || t.ageMax < 99) parts.push(`aged ${t.ageMin}–${t.ageMax}`);
  const shared = t.interests.filter((i) => v.interests.includes(i)).map((i) => INTERESTS[i]?.toLowerCase() ?? i);
  if (v.personalised && shared.length) parts.push(`interested in ${shared.slice(0, 2).join(" and ")}`);
  return `${businessName} wants to reach ${parts.length ? parts.join(", ") : "people on Kinara"}. Advertisers never see who you are.`;
}

// ---- serving ------------------------------------------------------------------------------------------------
function signToken(payload: string) {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`adtok:${payload}`).digest("base64url").slice(0, 22);
}
export function makeToken(campaignId: string, viewer: string, placement: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const body = `${campaignId}.${viewer}.${placement}.${exp}`;
  return `${Buffer.from(body).toString("base64url")}.${signToken(body)}`;
}
export function readToken(tok: string) {
  const [b, sig] = tok.split(".");
  if (!b || !sig) return null;
  const body = Buffer.from(b, "base64url").toString();
  if (signToken(body) !== sig) return null;
  const [campaignId, viewer, placement, exp] = body.split(".");
  if (!campaignId || Number(exp) * 1000 < Date.now()) return null;
  return { campaignId, viewer, placement };
}

/** Rolls the daily spend counter over at midnight UTC. */
function todaySpend(c: typeof schema.adCampaigns.$inferSelect) { return c.spentDay === today() ? c.spentTodayMinor : 0; }

/** `exclude`: campaigns already on screen, so one page never repeats the same ad. */
export async function pickAd(user: User, placement: Placement, device: string, language: string, exclude: string[] = []) {
  if (!(await getConfig("ads.enabled"))) return null;
  const v = await viewerFor(user, device, language);
  if (!v) return null;
  const now = new Date();
  const [cap, maxDay] = await Promise.all([getConfig("ads.frequencyPerCampaignPerDay"), getConfig("ads.maxPerMemberPerDay")]);
  const seen = await db.select({ c: schema.adEvents.campaignId, n: count() }).from(schema.adEvents)
    .where(and(eq(schema.adEvents.viewer, v.hash), eq(schema.adEvents.day, today()), eq(schema.adEvents.kind, "IMPRESSION"))).groupBy(schema.adEvents.campaignId);
  if (seen.reduce((a, r) => a + r.n, 0) >= maxDay) return null;
  const hidden = new Set((await db.select({ c: schema.adHidden.campaignId }).from(schema.adHidden).where(eq(schema.adHidden.userId, user.id))).map((r) => r.c));
  const rows = await db.select({ c: schema.adCampaigns, a: schema.advertisers }).from(schema.adCampaigns)
    .innerJoin(schema.advertisers, eq(schema.advertisers.id, schema.adCampaigns.advertiserId))
    .where(and(eq(schema.adCampaigns.status, "ACTIVE"), eq(schema.advertisers.status, "ACTIVE"))).limit(500);
  const candidates = rows.filter(({ c, a }) => {
    if (!c.placements.split(",").includes(placement) || hidden.has(c.id) || exclude.includes(c.id)) return false;
    if (c.startAt && c.startAt > now) return false;
    if (c.endAt && c.endAt < now) return false;
    if (c.pricing !== "FIXED") {
      if (a.balanceMinor <= 0) return false;
      if (c.totalBudgetMinor && c.spentMinor >= c.totalBudgetMinor) return false;
      if (c.dailyBudgetMinor && todaySpend(c) >= c.dailyBudgetMinor) return false;
    }
    if ((seen.find((s) => s.c === c.id)?.n ?? 0) >= cap) return false;
    return matchesTargeting(parseTargeting(c.targeting), v);
  });
  if (!candidates.length) return null;
  // Fixed placements first (they're paid for the period), then a fair random pick among the rest.
  const fixed = candidates.filter((x) => x.c.pricing === "FIXED");
  const pool = fixed.length ? fixed : candidates;
  const { c, a } = pool[Math.floor(Math.random() * pool.length)];
  const cr = parseCreative(c.creative);
  const url = async (k: string | null) => (k ? storage().url(k, 3600) : null);
  return {
    id: c.id, token: makeToken(c.id, v.hash, placement), placement, label: "Sponsored",
    advertiser: { name: a.businessName, verified: a.verification !== "UNVERIFIED", trusted: a.verification === "TRUSTED" },
    headline: cr.headline, description: cr.description, cta: CTAS[cr.cta as keyof typeof CTAS] ?? "Learn more",
    logo: await url(cr.logoKey), images: await Promise.all(cr.imageKeys.map((k) => url(k))), video: await url(cr.videoKey),
    hasLink: !!cr.url, why: whyText(a.businessName, parseTargeting(c.targeting), v),
  };
}

/** Website homepage banner for signed-out visitors: only ads with no personal targeting (we know nothing about them). */
export async function pickHomeAd() {
  if (!(await getConfig("ads.enabled"))) return null;
  const now = new Date();
  const rows = await db.select({ c: schema.adCampaigns, a: schema.advertisers }).from(schema.adCampaigns)
    .innerJoin(schema.advertisers, eq(schema.advertisers.id, schema.adCampaigns.advertiserId))
    .where(and(eq(schema.adCampaigns.status, "ACTIVE"), eq(schema.advertisers.status, "ACTIVE"))).limit(200);
  const pool = rows.filter(({ c, a }) => {
    const t = parseTargeting(c.targeting);
    if (!c.placements.split(",").includes("HOME") || (c.startAt && c.startAt > now) || (c.endAt && c.endAt < now)) return false;
    if (c.pricing !== "FIXED" && (a.balanceMinor <= 0 || (c.dailyBudgetMinor && todaySpend(c) >= c.dailyBudgetMinor))) return false;
    return !t.genders.length && !t.interests.length && t.ageMin === 18 && t.ageMax === 99;
  });
  if (!pool.length) return null;
  const { c, a } = pool[Math.floor(Math.random() * pool.length)];
  const cr = parseCreative(c.creative);
  const visitor = `web:${randomBytes(6).toString("hex")}`;
  return {
    id: c.id, token: makeToken(c.id, visitor, "HOME"), label: "Sponsored", advertiser: { name: a.businessName, verified: a.verification !== "UNVERIFIED" },
    headline: cr.headline, description: cr.description, cta: CTAS[cr.cta as keyof typeof CTAS] ?? "Learn more",
    logo: cr.logoKey ? await storage().url(cr.logoKey, 3600) : null, image: cr.imageKeys[0] ? await storage().url(cr.imageKeys[0], 3600) : null, hasLink: !!cr.url,
  };
}

/** Charges a campaign atomically: never below zero balance, never past its budgets. Returns false if it couldn't. */
async function charge(campaignId: string, advertiserId: string, cost: number) {
  if (cost <= 0) return true;
  const d = today();
  const r = await db.update(schema.advertisers).set({ balanceMinor: sql`${schema.advertisers.balanceMinor} - ${cost}` })
    .where(and(eq(schema.advertisers.id, advertiserId), gte(schema.advertisers.balanceMinor, cost))).returning({ id: schema.advertisers.id });
  if (!r.length) return false;
  await db.update(schema.adCampaigns).set({
    spentMinor: sql`${schema.adCampaigns.spentMinor} + ${cost}`,
    spentTodayMinor: sql`CASE WHEN ${schema.adCampaigns.spentDay} = ${d} THEN ${schema.adCampaigns.spentTodayMinor} + ${cost} ELSE ${cost} END`,
    spentDay: d,
  }).where(eq(schema.adCampaigns.id, campaignId));
  const c = await db.query.adCampaigns.findFirst({ where: eq(schema.adCampaigns.id, campaignId) });
  if (c && c.totalBudgetMinor && c.spentMinor >= c.totalBudgetMinor && c.status === "ACTIVE")
    await db.update(schema.adCampaigns).set({ status: "COMPLETED" }).where(eq(schema.adCampaigns.id, campaignId));
  return true;
}

export async function recordEvent(tok: string, kind: "IMPRESSION" | "CLICK" | "VIDEO_VIEW") {
  const t = readToken(tok);
  if (!t) throw new ApiError(400, "This ad link has expired.", "bad_token");
  const c = await db.query.adCampaigns.findFirst({ where: eq(schema.adCampaigns.id, t.campaignId) });
  if (!c) throw new ApiError(404, "Ad not found.", "not_found");
  const d = today();
  const pricing = await getConfig("ads.pricing");
  if (kind === "IMPRESSION") {
    const [{ n }] = await db.select({ n: count() }).from(schema.adEvents)
      .where(and(eq(schema.adEvents.campaignId, c.id), eq(schema.adEvents.viewer, t.viewer), eq(schema.adEvents.day, d), eq(schema.adEvents.kind, "IMPRESSION")));
    if (n >= (await getConfig("ads.frequencyPerCampaignPerDay"))) return { counted: false };
    const cost = c.pricing === "CPM" ? Math.max(1, Math.round(pricing.cpmMinor / 1000)) : 0;
    if (c.status === "ACTIVE" && !(await charge(c.id, c.advertiserId, cost))) return { counted: false };
    await db.insert(schema.adEvents).values({ campaignId: c.id, kind, placement: t.placement, viewer: t.viewer, costMinor: cost, day: d });
    return { counted: true };
  }
  if (kind === "VIDEO_VIEW") {
    await db.insert(schema.adEvents).values({ campaignId: c.id, kind, placement: t.placement, viewer: t.viewer, day: d });
    return { counted: true };
  }
  // CLICK: one billable click per member per ad per day; a click id lets the advertiser report conversions.
  const [{ n }] = await db.select({ n: count() }).from(schema.adEvents)
    .where(and(eq(schema.adEvents.campaignId, c.id), eq(schema.adEvents.viewer, t.viewer), eq(schema.adEvents.day, d), eq(schema.adEvents.kind, "CLICK")));
  const clickId = randomBytes(12).toString("base64url");
  const cost = c.pricing === "CPC" && n === 0 ? pricing.cpcMinor : 0;
  const billed = c.status === "ACTIVE" ? await charge(c.id, c.advertiserId, cost) : true;
  await db.insert(schema.adEvents).values({ campaignId: c.id, kind, placement: t.placement, viewer: t.viewer, clickId, costMinor: billed ? cost : 0, day: d });
  const url = parseCreative(c.creative).url;
  if (!url) return { counted: true, url: null };
  const u = new URL(url);
  u.searchParams.set("kn_click", clickId);
  return { counted: true, url: u.toString() };
}

/** Advertiser reports a conversion for a click (server-to-server or pixel). No member data is involved. */
export async function recordConversion(key: string, clickId: string) {
  const click = await db.query.adEvents.findFirst({ where: and(eq(schema.adEvents.clickId, clickId), eq(schema.adEvents.kind, "CLICK")) });
  if (!click) return { counted: false };
  const c = await db.query.adCampaigns.findFirst({ where: eq(schema.adCampaigns.id, click.campaignId) });
  if (!c || c.conversionKey !== key) return { counted: false };
  if (Date.now() - click.createdAt.getTime() > 30 * 86400_000) return { counted: false };
  const dup = await db.query.adEvents.findFirst({ where: and(eq(schema.adEvents.campaignId, c.id), eq(schema.adEvents.kind, "CONVERSION"), eq(schema.adEvents.viewer, `conv:${clickId}`)) });
  if (dup) return { counted: false };
  const cost = c.pricing === "CPA" ? (await getConfig("ads.pricing")).cpaMinor : 0;
  const billed = c.status === "ACTIVE" || c.status === "COMPLETED" ? await charge(c.id, c.advertiserId, cost) : true;
  await db.insert(schema.adEvents).values({ campaignId: c.id, kind: "CONVERSION", viewer: `conv:${clickId}`, costMinor: billed ? cost : 0, day: today() });
  return { counted: true };
}

// ---- analytics (aggregated only) -----------------------------------------------------------------------------
export async function campaignStats(campaignIds: string[], days = 30) {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  if (!campaignIds.length) return { totals: emptyTotals(), daily: [] as { day: string; impressions: number; clicks: number; spend: number }[] };
  const where = and(inArray(schema.adEvents.campaignId, campaignIds), gte(schema.adEvents.day, since));
  const byKind = await db.select({ kind: schema.adEvents.kind, n: count(), spend: sum(schema.adEvents.costMinor) }).from(schema.adEvents).where(where).groupBy(schema.adEvents.kind);
  const [{ reach }] = await db.select({ reach: countDistinct(schema.adEvents.viewer) }).from(schema.adEvents).where(and(where, eq(schema.adEvents.kind, "IMPRESSION")));
  const daily = await db.select({ day: schema.adEvents.day, kind: schema.adEvents.kind, n: count(), spend: sum(schema.adEvents.costMinor) }).from(schema.adEvents).where(where).groupBy(schema.adEvents.day, schema.adEvents.kind);
  const k = (x: string) => byKind.find((r) => r.kind === x);
  const impressions = k("IMPRESSION")?.n ?? 0, clicks = k("CLICK")?.n ?? 0, conversions = k("CONVERSION")?.n ?? 0;
  const spend = byKind.reduce((a, r) => a + Number(r.spend ?? 0), 0);
  const days2 = [...new Set(daily.map((d) => d.day))].sort();
  return {
    totals: {
      impressions, reach, clicks, conversions, videoViews: k("VIDEO_VIEW")?.n ?? 0, hides: k("HIDE")?.n ?? 0, spendMinor: spend,
      ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      cpcMinor: clicks ? Math.round(spend / clicks) : 0, cpaMinor: conversions ? Math.round(spend / conversions) : 0,
    },
    daily: days2.map((day) => ({
      day,
      impressions: daily.find((d) => d.day === day && d.kind === "IMPRESSION")?.n ?? 0,
      clicks: daily.find((d) => d.day === day && d.kind === "CLICK")?.n ?? 0,
      spend: daily.filter((d) => d.day === day).reduce((a, r) => a + Number(r.spend ?? 0), 0),
    })),
  };
}
const emptyTotals = () => ({ impressions: 0, reach: 0, clicks: 0, conversions: 0, videoViews: 0, hides: 0, spendMinor: 0, ctr: 0, cpcMinor: 0, cpaMinor: 0 });

/** Rough audience size for the targeting, rounded so it can't single anyone out. Not a promise of reach. */
export async function estimateReach(t: Targeting) {
  const rows = await db.select({ country: schema.profiles.country, city: schema.profiles.city, dob: schema.profiles.dob, gender: schema.profiles.gender, interests: schema.profiles.interests, pa: schema.preferences.personalisedAds })
    .from(schema.profiles).innerJoin(schema.users, eq(schema.users.id, schema.profiles.userId)).leftJoin(schema.preferences, eq(schema.preferences.userId, schema.profiles.userId))
    .where(and(eq(schema.users.status, "ACTIVE"), eq(schema.users.role, "USER"), eq(schema.users.onboardingStep, 3)));
  const defaults = new Map<string, boolean>();
  let n = 0;
  for (const r of rows) {
    if (!defaults.has(r.country)) defaults.set(r.country, (await countryRules(r.country)).personalisedAdsDefault);
    const personalised = r.pa ?? defaults.get(r.country)!;
    if (matchesTargeting(t, { country: r.country, city: r.city, age: ageFromDob(r.dob), gender: personalised ? r.gender : null, interests: personalised ? r.interests.split(",") : [], device: t.devices[0] ?? "web", language: t.languages[0] ?? "en", personalised })) n++;
  }
  if (n < 100) return { audience: "Fewer than 100 people", value: 0 };
  const rounded = n < 1000 ? Math.round(n / 50) * 50 : n < 10000 ? Math.round(n / 500) * 500 : Math.round(n / 5000) * 5000;
  return { audience: `About ${rounded.toLocaleString("en-IN")} people`, value: rounded };
}

export async function logAdAudit(actor: string | null, action: string, campaignId: string, meta: object = {}) {
  await audit(actor, `ads.${action}`, "ad_campaign", campaignId, meta);
}
