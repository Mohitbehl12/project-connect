// Kinara — core data model (Drizzle ORM, SQLite/libSQL dialect).
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
  referralCode: text("referral_code").unique(), // shareable invite code
  referredById: text("referred_by_id"),
  riskLevel: text("risk_level").notNull().default("LOW"), // LOW | MEDIUM | HIGH — computed from risk_signals
  totpSecret: text("totp_secret"), // encrypted; set only once 2-step verification is confirmed
  totpPending: text("totp_pending"), // encrypted secret awaiting confirmation
  totpLastStep: integer("totp_last_step"), // last accepted 30-second step — stops a code being replayed
  deletedAt: ts("deleted_at"), // account deletion requested → anonymised
  boostUntil: ts("boost_until"), // shown higher in Discover until then (rewards / boosts)
  completionRewardedAt: ts("completion_rewarded_at"),
  welcomeGiftAt: ts("welcome_gift_at"), // free-months gift given (once per account)
  signupIp: text("signup_ip"),
  signupInstallId: text("signup_install_id"),
  deactivatedAt: ts("deactivated_at"), // profile paused by the member: hidden everywhere until they come back
  staffUnlockedAt: ts("staff_unlocked_at"), // staff only: last 2-step check for admin tools (idle timeout)
  restrictedAt: ts("restricted_at"), // high risk: can't start new contact until verified or reviewed (never a ban)
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
  languages: text("languages").notNull().default(""), // comma-separated LANGUAGES keys (optional)
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
  showDistance: bool("show_distance").notNull().default(true), // off → others see only the city
  likesFrom: text("likes_from").notNull().default("EVERYONE"), // EVERYONE | VERIFIED — who can like (and so match with) me
  notifyMatches: bool("notify_matches").notNull().default(true),
  notifyMessages: bool("notify_messages").notNull().default(true),
  callRequests: text("call_requests").notNull().default("MATCHES"), // MATCHES | NOBODY: who may ask to call
  profileVisibility: text("profile_visibility").notNull().default("EVERYONE"), // EVERYONE | VERIFIED: who sees me in Discover
  photosVisibility: text("photos_visibility").notNull().default("EVERYONE"), // EVERYONE | MATCHES: extra photos (the first is always shown)
  showCity: bool("show_city").notNull().default(true), // off → others see only the country
  marketing: bool("marketing").notNull().default(false), // optional; never pre-ticked; consent history in `consents`
  personalisedAds: bool("personalised_ads"), // null = country default (on in most countries, off in the UK/EU)
  travelCity: text("travel_city"), // travel mode (plan feature): appear in and discover this city until travelUntil
  travelUntil: ts("travel_until"),
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
  endedAt: ts("ended_at"), // when the chat ended (retention clock)
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("matches_pair").on(t.userAId, t.userBId), index("matches_b").on(t.userBId)]);

export const messages = sqliteTable("messages", {
  id: id(),
  matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  kind: text("kind").notNull().default("TEXT"), // TEXT | SYSTEM | PHOTO | VOICE
  flags: text("flags").notNull().default(""), // moderation flags, comma-separated
  mediaKey: text("media_key"), // PHOTO/VOICE: storage key; deleted when the match ends
  mediaMeta: text("media_meta"), // JSON: { w, h, blurhash, checked } for photos, { ms, type } for voice
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
  caseNo: text("case_no"), // human case id shown to the reporter, e.g. KN-R-2026-000123
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
  seq: integer("seq"), // position in the hash chain
  prevHash: text("prev_hash"),
  hash: text("hash"), // sha256(prevHash + this row) — editing or deleting a row breaks the chain
}, (t) => [uniqueIndex("audit_seq").on(t.seq), index("audit_entity").on(t.entity, t.entityId), index("audit_time").on(t.createdAt)]);

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
  // Price group. "*" = everyone; "gender:MAN" etc. Gender groups only apply in countries listed in
  // config billing.genderPricingCountries (they're unlawful in some places, e.g. the EU).
  segment: text("segment").notNull().default("*"),
  providerPlanId: text("provider_plan_id"), // Razorpay plan id, created on first checkout
  // In-app purchase product ids (App Store Connect / Play Console). Same id in every country: the store
  // sets the local price. Men's prices in India are separate products (e.g. premium_men_1m).
  appleProductId: text("apple_product_id"),
  googleProductId: text("google_product_id"),
  active: bool("active").notNull().default(true),
}, (t) => [index("price_plan_country").on(t.planId, t.country)]);

export const subscriptions = sqliteTable("subscriptions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planCode: text("plan_code").notNull(),
  priceId: text("price_id"),
  provider: text("provider").notNull().default("MOCK"), // MOCK | RAZORPAY | APPLE | GOOGLE
  // PENDING (awaiting first payment) | TRIALING (intro period) | ACTIVE | PAST_DUE | CANCELLED (no renewal; access until endsAt) | EXPIRED
  status: text("status").notNull().default("ACTIVE"),
  kind: text("kind").notNull().default("RECURRING"), // RECURRING | PASS (one-off, never renews)
  amountMinor: integer("amount_minor").notNull().default(0), // regular price per period
  currency: text("currency").notNull().default("INR"),
  periodDays: integer("period_days").notNull().default(30),
  offerId: text("offer_id"),
  couponCode: text("coupon_code"),
  introEndsAt: ts("intro_ends_at"),
  nextChargeAt: ts("next_charge_at"),
  nextChargeMinor: integer("next_charge_minor"),
  pendingPlanCode: text("pending_plan_code"), // plan change scheduled for the next renewal
  cancelAtPeriodEnd: bool("cancel_at_period_end").notNull().default(false),
  providerRef: text("provider_ref"), // gateway subscription / order id
  reminderSentFor: ts("reminder_sent_for"), // nextChargeAt we last sent a renewal reminder for
  termsAcceptedAt: ts("terms_accepted_at"),
  startedAt: now("started_at"),
  endsAt: ts("ends_at").notNull(), // access runs until here
}, (t) => [index("subs_user").on(t.userId, t.status), index("subs_provider_ref").on(t.providerRef)]);

/** Campaign engine: intro offers (₹1 trials), time-boxed discounts and one-off passes. Every number is editable in Admin. */
export const offers = sqliteTable("offers", {
  id: id(),
  name: text("name").notNull(), // internal name, e.g. "Diwali 2026"
  kind: text("kind").notNull(), // INTRO | DISCOUNT | PASS
  headline: text("headline").notNull(), // shown to users, e.g. "Try Premium for ₹1"
  badge: text("badge"), // short tag, e.g. "Festival offer"
  planCode: text("plan_code").notNull(),
  country: text("country").notNull().default("IN"),
  genders: text("genders").notNull().default(""), // "" = everyone, else comma list e.g. "MAN"
  audience: text("audience").notNull().default("ALL"), // ALL | NEW | RETURNING (had Premium before, not now)
  priceMinor: integer("price_minor"), // INTRO: today's price; PASS: pass price
  days: integer("days"), // INTRO: intro length; PASS: pass length
  discountPct: integer("discount_pct"), // DISCOUNT: % off today's payment
  oncePerUser: bool("once_per_user").notNull().default(true),
  priority: integer("priority").notNull().default(0), // higher wins when several apply
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"), // shown to users only when real
  active: bool("active").notNull().default(true),
  createdById: text("created_by_id"),
  createdAt: now("created_at"),
}, (t) => [index("offers_lookup").on(t.country, t.planCode, t.active)]);

export const coupons = sqliteTable("coupons", {
  id: id(),
  code: text("code").notNull().unique(), // stored upper-case
  kind: text("kind").notNull(), // PERCENT | FIXED
  value: integer("value").notNull(), // percent, or minor units for FIXED
  currency: text("currency"), // required for FIXED
  maxDiscountMinor: integer("max_discount_minor"),
  minPurchaseMinor: integer("min_purchase_minor"),
  audience: text("audience").notNull().default("ALL"), // ALL | NEW | EXISTING
  countries: text("countries").notNull().default(""), // "" = any
  plans: text("plans").notNull().default(""),
  genders: text("genders").notNull().default(""), // only honoured where gender pricing is enabled
  usageLimit: integer("usage_limit"), // total redemptions; null = unlimited
  perUserLimit: integer("per_user_limit").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  active: bool("active").notNull().default(true),
  createdById: text("created_by_id"),
  createdAt: now("created_at"),
});

export const couponRedemptions = sqliteTable("coupon_redemptions", {
  id: id(),
  couponId: text("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  paymentId: text("payment_id").notNull().unique(),
  discountMinor: integer("discount_minor").notNull(),
  createdAt: now("created_at"),
}, (t) => [index("coupon_red_user").on(t.couponId, t.userId)]);

/**
 * One row per charge attempt. Holds only what's needed for receipts, support and accounting —
 * never card numbers, CVV, UPI PIN or bank credentials (the gateway keeps those).
 */
export const payments = sqliteTable("payments", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: text("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  purpose: text("purpose").notNull().default("INITIAL"), // INITIAL | RENEWAL | PASS
  status: text("status").notNull().default("CREATED"), // CREATED | CAPTURED | FAILED | REFUNDED | PARTIALLY_REFUNDED
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  planCode: text("plan_code").notNull(),
  offerId: text("offer_id"),
  couponCode: text("coupon_code"),
  discountMinor: integer("discount_minor").notNull().default(0),
  providerOrderId: text("provider_order_id"),
  providerPaymentId: text("provider_payment_id").unique(),
  method: text("method"), // upi | card | netbanking | wallet — category only
  failureCode: text("failure_code"),
  failureReason: text("failure_reason"), // user-safe wording
  refundedMinor: integer("refunded_minor").notNull().default(0),
  disputed: bool("disputed").notNull().default(false),
  invoiceNo: text("invoice_no").unique(),
  createdAt: now("created_at"),
  paidAt: ts("paid_at"),
}, (t) => [index("payments_user").on(t.userId, t.createdAt), index("payments_status").on(t.status, t.paidAt)]);

/** Two-person refund workflow: a request, then a decision by someone else with refund rights. */
export const refunds = sqliteTable("refunds", {
  id: id(),
  paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  amountMinor: integer("amount_minor").notNull(),
  reason: text("reason").notNull(),
  revokeAccess: bool("revoke_access").notNull().default(false),
  status: text("status").notNull().default("REQUESTED"), // REQUESTED | APPROVED | REJECTED | PROCESSED | FAILED
  requestedById: text("requested_by_id").notNull(),
  decidedById: text("decided_by_id"),
  decisionNote: text("decision_note"),
  providerRefundId: text("provider_refund_id").unique(),
  createdAt: now("created_at"),
  decidedAt: ts("decided_at"),
  processedAt: ts("processed_at"),
}, (t) => [index("refunds_status").on(t.status)]);

/** Every gateway webhook we've seen — makes processing idempotent and leaves an audit trail. */
export const webhookEvents = sqliteTable("webhook_events", {
  id: id(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("RECEIVED"), // RECEIVED | PROCESSED | IGNORED | FAILED
  error: text("error"),
  receivedAt: now("received_at"),
  processedAt: ts("processed_at"),
}, (t) => [uniqueIndex("webhook_unique").on(t.provider, t.eventId)]);

/** Consecutive invoice numbers per financial year (GST invoices must be serial). */
export const invoiceCounters = sqliteTable("invoice_counters", {
  fy: text("fy").primaryKey(), // e.g. "2026-27"
  last: integer("last").notNull().default(0),
});

export const referrals = sqliteTable("referrals", {
  id: id(),
  referrerId: text("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refereeId: text("referee_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("PENDING"), // PENDING (joined) | REWARDED | REJECTED | HELD (needs review)
  reason: text("reason"),
  rewardDays: integer("reward_days"),
  createdAt: now("created_at"),
  decidedAt: ts("decided_at"),
}, (t) => [index("referrals_referrer").on(t.referrerId)]);

/** Fraud and abuse signals feeding a user's risk level. Signals add up; none bans anyone on its own. */
export const riskSignals = sqliteTable("risk_signals", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // SHARED_DEVICE | SIGNUP_BURST | TRIAL_REUSE | REFERRAL_ABUSE | CHARGEBACK | PAYMENT_FAILURES | MESSAGE_FLAGS | NEW_DEVICE_LOGIN
  weight: integer("weight").notNull(),
  detail: text("detail"),
  resolvedAt: ts("resolved_at"),
  resolvedById: text("resolved_by_id"),
  createdAt: now("created_at"),
}, (t) => [index("risk_user").on(t.userId, t.createdAt)]);

/** Sign-in history (successes and failures) for the Security screen and takeover detection. */
export const loginEvents = sqliteTable("login_events", {
  id: id(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  success: bool("success").notNull(),
  reason: text("reason"), // bad_password | locked | banned | totp_required | ok
  ip: text("ip"),
  platform: text("platform"), // ios | android | web
  deviceName: text("device_name"),
  installId: text("install_id"), // random per app install; not a hardware identifier
  createdAt: now("created_at"),
}, (t) => [index("login_user").on(t.userId, t.createdAt), index("login_install").on(t.installId), index("login_ip").on(t.ip, t.createdAt)]);

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
  changeSummary: text("change_summary"), // what changed, shown to members
  material: bool("material").notNull().default(true), // material change → members must accept again
  lawyerReviewedBy: text("lawyer_reviewed_by"), // name/firm of the qualified reviewer, entered by staff
  lawyerReviewedAt: ts("lawyer_reviewed_at"),
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
  ip: text("ip"),
  installId: text("install_id"),
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

/** "Forgot password" links: single-use, 30 minutes, stored only as a SHA-256 hash. */
export const passwordResets = sqliteTable("password_resets", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  ip: text("ip"),
  createdAt: now("created_at"),
}, (t) => [index("password_resets_user").on(t.userId)]);

/**
 * Formal complaints to the Grievance Officer (India IT Rules 2021): acknowledged within 24 hours,
 * resolved within 15 days; complaints about intimate images or impersonation acted on within 24 hours.
 * The complaint text and contact email are encrypted at rest.
 */
export const grievances = sqliteTable("grievances", {
  id: id(),
  refNo: text("ref_no").notNull().unique(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email").notNull(), // sealed
  category: text("category").notNull(), // ACCOUNT | CONTENT | INTIMATE_OR_IMPERSONATION | PRIVACY | PAYMENT | SAFETY | OTHER
  details: text("details").notNull(), // sealed
  status: text("status").notNull().default("ACKNOWLEDGED"), // ACKNOWLEDGED | IN_PROGRESS | RESOLVED | REJECTED
  ackDueAt: ts("ack_due_at").notNull(),
  resolveDueAt: ts("resolve_due_at").notNull(),
  acknowledgedAt: ts("acknowledged_at"),
  resolvedAt: ts("resolved_at"),
  resolution: text("resolution"), // sealed; sent to the complainant
  handledById: text("handled_by_id"),
  createdAt: now("created_at"),
}, (t) => [index("grievances_status").on(t.status, t.resolveDueAt)]);

/**
 * Selfie verification attempts. The member gets a random pose, takes a selfie, and the server checks for one
 * face and compares it with their profile photos; staff make the final decision. The selfie image is deleted
 * as soon as staff decide — only the outcome and the match score are kept.
 */
export const verificationAttempts = sqliteTable("verification_attempts", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pose: text("pose").notNull(),
  state: text("state").notNull().default("CHALLENGE"), // CHALLENGE | RETAKE | PENDING | APPROVED | REJECTED
  storageKey: text("storage_key"), // the selfie, until staff decide
  faceCount: integer("face_count"),
  bestDistance: real("best_distance"), // lowest face distance to a profile photo (lower = more alike)
  profileFaces: integer("profile_faces"),
  note: text("note"), // what the person was told on a retake, or staff's reason
  expiresAt: ts("expires_at").notNull(),
  submittedAt: ts("submitted_at"),
  decidedAt: ts("decided_at"),
  decidedById: text("decided_by_id"),
  createdAt: now("created_at"),
}, (t) => [index("verif_user").on(t.userId, t.state)]);

/**
 * Voice and video calls between matched members. Media goes person-to-person over WebRTC (through a TURN
 * relay when one is set up, which also hides each person's IP address); the server only relays the
 * connection setup and keeps this log, never audio or video.
 */
export const calls = sqliteTable("calls", {
  id: id(),
  matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  callerId: text("caller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  calleeId: text("callee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // AUDIO | VIDEO
  state: text("state").notNull().default("RINGING"), // RINGING | ACTIVE | ENDED
  endReason: text("end_reason"), // DECLINED | MISSED | HUNG_UP | CANCELLED | FAILED | BLOCKED
  endedById: text("ended_by_id"),
  createdAt: now("created_at"),
  answeredAt: ts("answered_at"),
  endedAt: ts("ended_at"),
}, (t) => [index("calls_match").on(t.matchId, t.createdAt), index("calls_callee").on(t.calleeId, t.state)]);

/** Browser push subscriptions (the home-screen web app on iPhone, Android browsers). One row per device. */
export const webPushSubscriptions = sqliteTable("web_push_subscriptions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: now("created_at"),
  lastOkAt: ts("last_ok_at"),
}, (t) => [uniqueIndex("webpush_endpoint").on(t.endpoint), index("webpush_user").on(t.userId)]);

/** A heart on a message (one per person per message). */
export const messageReactions = sqliteTable("message_reactions", {
  id: id(),
  messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull().default("❤️"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("reaction_once").on(t.messageId, t.userId)]);

/**
 * Asking before calling: a call can only start after the other person accepts a request. An accepted
 * request lets either of them start calls for a limited time; she (or he) can decline, block or report.
 */
export const callRequests = sqliteTable("call_requests", {
  id: id(),
  matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  fromId: text("from_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toId: text("to_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("VIDEO"), // AUDIO | VIDEO
  state: text("state").notNull().default("PENDING"), // PENDING | ACCEPTED | DECLINED | CANCELLED | EXPIRED
  createdAt: now("created_at"),
  respondedAt: ts("responded_at"),
  expiresAt: ts("expires_at").notNull(), // a pending request lapses; an accepted one stops allowing calls
}, (t) => [index("callreq_match").on(t.matchId, t.createdAt), index("callreq_to").on(t.toId, t.state)]);

// ---- Privacy, safety and compliance (21 Oct 2026) --------------------------------------------------
/** Append-only consent history: what, when, which version, from where. The latest row per kind is current. */
export const consents = sqliteTable("consents", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // see CONSENT_KINDS in src/lib/consent.ts
  granted: bool("granted").notNull(),
  version: text("version"), // policy/terms version or wording id the person saw
  source: text("source").notNull().default("app"), // app | web | signup | system
  ip: text("ip"),
  createdAt: now("created_at"),
}, (t) => [index("consents_user_kind").on(t.userId, t.kind, t.createdAt)]);

/** Appeals against suspensions, bans, report outcomes, verification and automated decisions. Decided by a person. */
export const appeals = sqliteTable("appeals", {
  id: id(),
  caseNo: text("case_no").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  contactEmail: text("contact_email"), // only for banned members who can't sign in
  kind: text("kind").notNull(), // SUSPENSION | BAN | RESTRICTION | REPORT_OUTCOME | VERIFICATION | PHOTO | AUTOMATED | OTHER
  refId: text("ref_id"), // moderation action, report, photo or automated decision
  details: text("details").notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN | UPHELD | OVERTURNED
  decision: text("decision"),
  decidedById: text("decided_by_id"),
  decidedAt: ts("decided_at"),
  createdAt: now("created_at"),
}, (t) => [index("appeals_status").on(t.status, t.createdAt), index("appeals_user").on(t.userId)]);

/** Automated decisions that affect a person (photo screening, message flags, risk levels…), so they can be reviewed and appealed. */
export const automatedDecisions = sqliteTable("automated_decisions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // PHOTO_SCREEN | MESSAGE_FLAG | RISK_LEVEL | SELFIE_MATCH | RESTRICTION
  decision: text("decision").notNull(),
  reason: text("reason").notNull(), // plain-language reason (no sensitive inferences)
  system: text("system").notNull(), // which rule set / model and version
  refId: text("ref_id"),
  reviewedById: text("reviewed_by_id"),
  reviewOutcome: text("review_outcome"),
  createdAt: now("created_at"),
}, (t) => [index("autodec_user").on(t.userId, t.createdAt)]);

/** Muted chats: no notifications for that conversation. */
export const chatMutes = sqliteTable("chat_mutes", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("chat_mute_pair").on(t.userId, t.matchId)]);

/** Legal hold: stops retention purges for one account (serious report, lawful request). */
export const legalHolds = sqliteTable("legal_holds", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  kind: text("kind").notNull().default("SAFETY"), // SAFETY | LAWFUL_REQUEST | LITIGATION
  reference: text("reference"), // e.g. authority's request number
  createdById: text("created_by_id").notNull(),
  until: ts("until"),
  releasedAt: ts("released_at"),
  createdAt: now("created_at"),
}, (t) => [index("legal_holds_user").on(t.userId)]);

/** Profile boosts: shown higher in Discover for 30 minutes. Plans include a monthly number. */
export const boosts = sqliteTable("boosts", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startedAt: now("started_at"),
  endsAt: ts("ends_at").notNull(),
}, (t) => [index("boosts_user").on(t.userId, t.startedAt)]);

// ---- Advertising (businesses advertise to members; members' personal data never reaches advertisers) ----
export const advertisers = sqliteTable("advertisers", {
  id: id(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }), // the login (role ADVERTISER)
  businessName: text("business_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  category: text("category").notNull(),
  website: text("website"),
  address: text("address"),
  gstin: text("gstin"),
  verification: text("verification").notNull().default("UNVERIFIED"), // UNVERIFIED | VERIFIED | TRUSTED
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED
  balanceMinor: integer("balance_minor").notNull().default(0), // prepaid advertising balance (paise)
  currency: text("currency").notNull().default("INR"),
  verifiedById: text("verified_by_id"),
  verifiedAt: ts("verified_at"),
  createdAt: now("created_at"),
});

export const adCampaigns = sqliteTable("ad_campaigns", {
  id: id(),
  advertiserId: text("advertiser_id").notNull().references(() => advertisers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  objective: text("objective").notNull(),
  status: text("status").notNull().default("DRAFT"), // DRAFT | PENDING_REVIEW | APPROVED | REJECTED | ACTIVE | PAUSED | COMPLETED
  placements: text("placements").notNull().default("DISCOVER"), // csv of DISCOVER | FEED | STORY | BANNER | HOME | RECOMMENDATION
  pricing: text("pricing").notNull().default("CPM"), // CPM | CPC | CPA | FIXED
  dailyBudgetMinor: integer("daily_budget_minor").notNull().default(0),
  totalBudgetMinor: integer("total_budget_minor").notNull().default(0),
  spentMinor: integer("spent_minor").notNull().default(0),
  spentTodayMinor: integer("spent_today_minor").notNull().default(0),
  spentDay: text("spent_day"), // YYYY-MM-DD the daily counter belongs to
  startAt: ts("start_at"),
  endAt: ts("end_at"),
  targeting: text("targeting").notNull().default("{}"), // JSON: countries, cities, ageMin, ageMax, genders, interests, devices, languages
  creative: text("creative").notNull().default("{}"), // JSON: headline, description, cta, url, logoKey, imageKeys, videoKey
  autoFlags: text("auto_flags"), // automated check notes for reviewers
  reviewNote: text("review_note"), // internal
  publicReason: text("public_reason"), // shown to the advertiser on rejection (general)
  reviewedById: text("reviewed_by_id"),
  reviewedAt: ts("reviewed_at"),
  submittedAt: ts("submitted_at"),
  conversionKey: text("conversion_key").notNull().$defaultFn(() => crypto.randomUUID().replace(/-/g, "")),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("adc_adv").on(t.advertiserId), index("adc_status").on(t.status)]);

/** One row per ad event. `viewer` is a keyed hash of the member id (frequency caps and unique reach) — never the id. */
export const adEvents = sqliteTable("ad_events", {
  id: id(),
  campaignId: text("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // IMPRESSION | CLICK | VIDEO_VIEW | CONVERSION | HIDE | REPORT
  placement: text("placement"),
  viewer: text("viewer"),
  clickId: text("click_id"),
  costMinor: integer("cost_minor").notNull().default(0),
  day: text("day").notNull(),
  createdAt: now("created_at"),
}, (t) => [index("ade_campaign_day").on(t.campaignId, t.day, t.kind), index("ade_viewer").on(t.viewer, t.day), uniqueIndex("ade_click").on(t.clickId)]);

export const adTransactions = sqliteTable("ad_transactions", {
  id: id(),
  advertiserId: text("advertiser_id").notNull().references(() => advertisers.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // TOPUP | REFUND | FIXED_PLACEMENT | ADJUSTMENT
  status: text("status").notNull().default("PENDING"), // PENDING | PAID | FAILED | REQUESTED | APPROVED | REJECTED | DONE
  amountMinor: integer("amount_minor").notNull(),
  provider: text("provider"), // RAZORPAY | TEST
  providerOrderId: text("provider_order_id"),
  providerPaymentId: text("provider_payment_id"),
  receiptNo: text("receipt_no"),
  note: text("note"),
  decidedById: text("decided_by_id"),
  createdAt: now("created_at"),
  paidAt: ts("paid_at"),
}, (t) => [index("adt_adv").on(t.advertiserId, t.createdAt), index("adt_order").on(t.providerOrderId)]);

export const adReports = sqliteTable("ad_reports", {
  id: id(),
  caseNo: text("case_no").notNull(),
  campaignId: text("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  reporterId: text("reporter_id").references(() => users.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("OPEN"), // OPEN | ACTIONED | DISMISSED
  resolution: text("resolution"),
  createdAt: now("created_at"),
}, (t) => [index("adr_status").on(t.status)]);

/** Ads a member chose to hide. */
export const adHidden = sqliteTable("ad_hidden", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("ad_hidden_pair").on(t.userId, t.campaignId)]);
