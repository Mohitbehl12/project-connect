// Project Connect — core data model (Drizzle ORM, SQLite/libSQL dialect).
// Enum-like columns are text; allowed values live in src/lib/constants.ts and are validated at the API edge.
// Porting to Postgres: swap sqlite-core for pg-core; the shapes map 1:1.
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = (name: string) => ts(name).notNull().$defaultFn(() => new Date());
const bool = (name: string) => integer(name, { mode: "boolean" });

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  dob: text("dob"), // YYYY-MM-DD, captured at signup for the 18+ gate; copied to the profile
  role: text("role").notNull().default("USER"), // USER | MODERATOR | SUPPORT | ADMIN | SUPER_ADMIN
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED | BANNED
  tokenVersion: integer("token_version").notNull().default(0), // bump to revoke all sessions
  emailVerified: bool("email_verified").notNull().default(false),
  phoneVerified: bool("phone_verified").notNull().default(false),
  selfieStatus: text("selfie_status").notNull().default("NONE"), // NONE | PENDING | VERIFIED | REJECTED
  planCode: text("plan_code").notNull().default("FREE"),
  planEndsAt: ts("plan_ends_at"),
  onboardingStep: integer("onboarding_step").notNull().default(0), // 0 profile → 1 prefs → 2 personality → 3 done
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: ts("locked_until"),
  createdAt: now("created_at"),
  lastActiveAt: now("last_active_at"),
}, (t) => [index("users_status_role").on(t.status, t.role)]);

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  dob: text("dob").notNull(), // YYYY-MM-DD
  gender: text("gender").notNull(), // WOMAN | MAN | NONBINARY
  bio: text("bio").notNull().default(""),
  country: text("country").notNull(), // ISO-3166 alpha-2
  city: text("city").notNull(),
  lat: real("lat").notNull(), // PRIVATE — never returned to other users
  lng: real("lng").notNull(),
  education: text("education"),
  profession: text("profession"),
  industry: text("industry"),
  heightCm: integer("height_cm"),
  drinking: text("drinking"),
  smoking: text("smoking"),
  food: text("food"),
  exercise: text("exercise"),
  pets: text("pets"),
  intent: text("intent").notNull(),
  interests: text("interests").notNull().default(""), // comma-separated keys
  photos: text("photos").notNull().default("[]"), // JSON array of storage keys
  prompts: text("prompts").notNull().default("[]"), // JSON [{q,a}]
  completeness: integer("completeness").notNull().default(0),
  updatedAt: now("updated_at"),
}, (t) => [index("profiles_discovery").on(t.country, t.gender, t.dob), index("profiles_city").on(t.city)]);

export const preferences = sqliteTable("preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  interestedIn: text("interested_in").notNull().default(""),
  ageMin: integer("age_min").notNull().default(21),
  ageMax: integer("age_max").notNull().default(35),
  maxDistanceKm: integer("max_distance_km").notNull().default(50),
  intents: text("intents").notNull().default(""), // empty = open to any
  longDistance: bool("long_distance").notNull().default(false),
  discoverable: bool("discoverable").notNull().default(true),
  showOnline: bool("show_online").notNull().default(true),
  readReceipts: bool("read_receipts").notNull().default(true),
  incognito: bool("incognito").notNull().default(false),
  notifyMatches: bool("notify_matches").notNull().default(true),
  notifyMessages: bool("notify_messages").notNull().default(true),
  notifyLikes: bool("notify_likes").notNull().default(true),
  notifyEmail: bool("notify_email").notNull().default(false),
  theme: text("theme").notNull().default("SYSTEM"), // SYSTEM | LIGHT | DARK
});

export const personalityAnswers = sqliteTable("personality_answers", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  questionKey: text("question_key").notNull(),
  value: integer("value").notNull(), // 1..5
}, (t) => [uniqueIndex("pa_user_q").on(t.userId, t.questionKey)]);

export const likes = sqliteTable("likes", {
  id: id(),
  fromId: text("from_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toId: text("to_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // LIKE | PASS | PRIORITY
  note: text("note"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("likes_pair").on(t.fromId, t.toId), index("likes_to").on(t.toId, t.kind), index("likes_from_time").on(t.fromId, t.createdAt)]);

export const matches = sqliteTable("matches", {
  id: id(),
  userAId: text("user_a_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userBId: text("user_b_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  reasons: text("reasons").notNull().default("[]"),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | UNMATCHED
  unmatchedBy: text("unmatched_by"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("matches_pair").on(t.userAId, t.userBId), index("matches_b").on(t.userBId)]);

export const messages = sqliteTable("messages", {
  id: id(),
  matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  kind: text("kind").notNull().default("TEXT"), // TEXT | SYSTEM
  flags: text("flags").notNull().default(""), // moderation flags, comma-separated
  readAt: ts("read_at"),
  deletedAt: ts("deleted_at"),
  createdAt: now("created_at"),
}, (t) => [index("messages_match_time").on(t.matchId, t.createdAt)]);

export const datePlans = sqliteTable("date_plans", {
  id: id(),
  matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  proposerId: text("proposer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // COFFEE | MEAL | WALK | ACTIVITY | OTHER
  place: text("place").notNull(), // public venue — never a home address
  startsAt: ts("starts_at").notNull(),
  status: text("status").notNull().default("PROPOSED"), // PROPOSED | CONFIRMED | CANCELLED
  note: text("note"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("dates_match").on(t.matchId)]);

export const blocks = sqliteTable("blocks", {
  id: id(),
  blockerId: text("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: text("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("blocks_pair").on(t.blockerId, t.blockedId), index("blocks_blocked").on(t.blockedId)]);

export const reports = sqliteTable("reports", {
  id: id(),
  reporterId: text("reporter_id").references(() => users.id, { onDelete: "set null" }), // null = automated
  reportedId: text("reported_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  matchId: text("match_id"),
  messageId: text("message_id"),
  category: text("category").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("OPEN"), // OPEN | ACTIONED | DISMISSED
  priority: text("priority").notNull().default("MEDIUM"), // LOW | MEDIUM | HIGH | CRITICAL
  automated: bool("automated").notNull().default(false),
  resolution: text("resolution"),
  resolvedById: text("resolved_by_id"),
  resolvedAt: ts("resolved_at"),
  createdAt: now("created_at"),
}, (t) => [index("reports_queue").on(t.status, t.priority, t.createdAt), index("reports_reported").on(t.reportedId)]);

export const moderationActions = sqliteTable("moderation_actions", {
  id: id(),
  actorId: text("actor_id").notNull().references(() => users.id),
  targetUserId: text("target_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // WARN | SUSPEND | BAN | RESTORE | VERIFY | REJECT_VERIFICATION
  reason: text("reason").notNull(),
  reportId: text("report_id"),
  createdAt: now("created_at"),
}, (t) => [index("mod_target").on(t.targetUserId)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: id(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  meta: text("meta").notNull().default("{}"),
  ip: text("ip"),
  createdAt: now("created_at"),
}, (t) => [index("audit_entity").on(t.entity, t.entityId), index("audit_time").on(t.createdAt)]);

export const notifications = sqliteTable("notifications", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  readAt: ts("read_at"),
  createdAt: now("created_at"),
}, (t) => [index("notif_user").on(t.userId, t.readAt)]);

export const otpCodes = sqliteTable("otp_codes", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(), // EMAIL | PHONE
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: now("created_at"),
}, (t) => [index("otp_user").on(t.userId, t.channel)]);

export const plans = sqliteTable("plans", {
  id: id(),
  code: text("code").notNull().unique(), // FREE | PREMIUM | PREMIUM_PLUS | VIP
  name: text("name").notNull(),
  features: text("features").notNull().default("{}"), // JSON entitlements
  sortOrder: integer("sort_order").notNull().default(0),
  active: bool("active").notNull().default(true),
});

export const planPrices = sqliteTable("plan_prices", {
  id: id(),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  country: text("country").notNull(), // ISO code or "*" default
  currency: text("currency").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  promoMinor: integer("promo_minor"),
  durationDays: integer("duration_days").notNull(),
  active: bool("active").notNull().default(true),
}, (t) => [index("price_plan_country").on(t.planId, t.country)]);

export const subscriptions = sqliteTable("subscriptions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planCode: text("plan_code").notNull(),
  priceId: text("price_id"),
  provider: text("provider").notNull().default("MOCK"), // MOCK | RAZORPAY | STRIPE | APPLE | GOOGLE
  status: text("status").notNull().default("ACTIVE"),
  amountMinor: integer("amount_minor").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  startedAt: now("started_at"),
  endsAt: ts("ends_at").notNull(),
}, (t) => [index("subs_user").on(t.userId, t.status)]);

export const legalDocuments = sqliteTable("legal_documents", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  requiredAtSignup: bool("required_at_signup").notNull().default(false),
});

export const legalVersions = sqliteTable("legal_versions", {
  id: id(),
  documentId: text("document_id").notNull().references(() => legalDocuments.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("DRAFT"), // DRAFT | IN_REVIEW | PUBLISHED | SUPERSEDED
  effectiveAt: ts("effective_at"),
  publishedAt: ts("published_at"),
  createdById: text("created_by_id"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("legal_doc_version").on(t.documentId, t.version)]);

export const legalAcceptances = sqliteTable("legal_acceptances", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  versionId: text("version_id").notNull().references(() => legalVersions.id),
  ip: text("ip"),
  acceptedAt: now("accepted_at"),
}, (t) => [uniqueIndex("legal_accept_pair").on(t.userId, t.versionId)]);

export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON
  updatedBy: text("updated_by"),
  updatedAt: now("updated_at"),
});

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Preferences = typeof preferences.$inferSelect;

// ---------------------------------------------------------------------------
// Mobile additions
// ---------------------------------------------------------------------------

/** Ordered, moderated profile photos. position 0 = primary. */
export const photos = sqliteTable("photos", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(), // driver-relative key of the processed image
  position: integer("position").notNull().default(0),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  blurhash: text("blurhash").notNull(),
  status: text("status").notNull().default("LIVE"), // PENDING | LIVE | REJECTED
  quality: text("quality").notNull().default("GOOD"), // GOOD | DARK | BLURRY | SMALL
  createdAt: now("created_at"),
}, (t) => [index("photos_user_pos").on(t.userId, t.position)]);

/** Native-app sessions: rotating refresh tokens (stored hashed). */
export const sessions = sqliteTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  family: text("family").notNull(), // all rotations of one login share a family; reuse revokes it
  refreshHash: text("refresh_hash").notNull().unique(),
  deviceName: text("device_name"),
  platform: text("platform"),
  createdAt: now("created_at"),
  lastUsedAt: now("last_used_at"),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
}, (t) => [index("sessions_user").on(t.userId), index("sessions_family").on(t.family)]);

/** Push notification targets. */
export const devices = sqliteTable("devices", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pushToken: text("push_token").notNull().unique(),
  platform: text("platform").notNull(), // ios | android
  appVersion: text("app_version"),
  updatedAt: now("updated_at"),
}, (t) => [index("devices_user").on(t.userId)]);
