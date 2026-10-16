import "server-only";
// App Store and Google Play subscriptions. The phone buys through the store; the server never trusts the
// phone's word for it: every purchase is verified here (Apple's signed transaction, or Google's
// Play Developer API) before Premium is granted, and the stores' server notifications keep it in sync
// (renewals, cancellations, refunds).
//
// Setup (see docs/STORES.md):
//   Apple  — APPLE_BUNDLE_ID, APPLE_APP_ID (numeric, from App Store Connect), Apple root certificates in
//            certs/apple/*.cer (download from apple.com/certificateauthority) or APPLE_ROOT_CERTS_B64.
//   Google — GOOGLE_PACKAGE_NAME, GOOGLE_SERVICE_ACCOUNT_JSON_B64 (a service account with access to the app
//            in Play Console), GOOGLE_RTDN_TOKEN (shared secret in the Pub/Sub push URL).
//   STORE_BILLING_ENABLED=true shows in-app purchase in the app.
// Test mode (only where mock payments are allowed): tokens starting "mock:" carry the purchase as JSON so the
// end-to-end tests can exercise the whole flow without a store. NOT real verification.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { importPKCS8, SignJWT } from "jose";
import { ApiError } from "../http";

export type StoreName = "APPLE" | "GOOGLE";
export type StoreStatus = "ACTIVE" | "GRACE" | "EXPIRED" | "REVOKED" | "PENDING";

/** One store subscription as the store reports it right now. */
export type StoreState = {
  store: StoreName;
  ref: string; // Apple originalTransactionId | Google purchaseToken — stable for the life of the subscription
  productId: string;
  accountToken: string | null; // Apple appAccountToken | Google obfuscatedExternalAccountId
  transactionId: string | null; // this period's id (Apple transactionId | Google latest order id)
  startsAt: Date;
  expiresAt: Date;
  autoRenew: boolean;
  status: StoreStatus;
  amountMinor: number | null;
  currency: string | null;
  environment: string; // Production | Sandbox | Test
  replacesRef?: string | null; // Google: token of the subscription this one replaced (upgrade/downgrade)
};

/** The id that ties a store purchase to our account. Apple needs a UUID (our user ids are UUIDs); Google gets a hash. */
export function accountTokenFor(store: StoreName, userId: string) {
  return store === "APPLE" ? userId.toLowerCase() : createHash("sha256").update(`pc:${userId}`).digest("hex");
}

export function storeBillingEnabled() {
  return process.env.STORE_BILLING_ENABLED === "true";
}

export function storeTestModeAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_MOCK_PAYMENTS === "true";
}

// ---------------------------------------------------------------------------------------------------------
// Test mode
// ---------------------------------------------------------------------------------------------------------

function fromMockToken(store: StoreName, token: string): StoreState | null {
  if (!token.startsWith("mock:")) return null;
  if (!storeTestModeAllowed()) throw new ApiError(400, "That purchase couldn't be verified.", "store_invalid");
  const j = JSON.parse(Buffer.from(token.slice(5), "base64url").toString("utf8"));
  return {
    store, ref: String(j.ref), productId: String(j.productId), accountToken: j.accountToken ?? null, transactionId: j.transactionId ?? null,
    startsAt: new Date(j.startsAt ?? Date.now()), expiresAt: new Date(j.expiresAt), autoRenew: j.autoRenew !== false,
    status: j.status ?? "ACTIVE", amountMinor: j.amountMinor ?? null, currency: j.currency ?? null, environment: "Test", replacesRef: j.replacesRef ?? null,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------------------------------------

function appleRoots(): Buffer[] {
  const out: Buffer[] = [];
  for (const b64 of (process.env.APPLE_ROOT_CERTS_B64 ?? "").split(",").map((s) => s.trim()).filter(Boolean)) out.push(Buffer.from(b64, "base64"));
  const dir = process.env.APPLE_ROOT_CERTS_DIR ?? path.join(process.cwd(), "certs", "apple");
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => /\.(cer|der)$/i.test(x))) out.push(readFileSync(path.join(dir, f)));
  return out;
}

async function appleVerifiers() {
  const bundleId = process.env.APPLE_BUNDLE_ID;
  const roots = appleRoots();
  if (!bundleId || !roots.length) throw new ApiError(503, "App Store purchases aren't set up on the server yet.", "store_not_configured");
  const { SignedDataVerifier, Environment } = await import("@apple/app-store-server-library");
  const appId = process.env.APPLE_APP_ID ? Number(process.env.APPLE_APP_ID) : undefined;
  const online = process.env.APPLE_ONLINE_CHECKS !== "false";
  const list = [];
  if (appId) list.push(new SignedDataVerifier(roots, online, Environment.PRODUCTION, bundleId, appId));
  // TestFlight and Xcode testing use the sandbox; real money never flows there.
  list.push(new SignedDataVerifier(roots, online, Environment.SANDBOX, bundleId));
  return list;
}

/** Tries each environment's verifier; the first that accepts the signature wins. */
async function appleVerify<T>(fn: (v: Awaited<ReturnType<typeof appleVerifiers>>[number]) => Promise<T>): Promise<T> {
  let last: unknown = null;
  for (const v of await appleVerifiers()) {
    try { return await fn(v); } catch (e) { last = e; }
  }
  console.warn("[stores] Apple verification failed:", (last as Error)?.message ?? last);
  throw new ApiError(400, "That App Store purchase couldn't be verified.", "store_invalid");
}

type AppleTx = {
  originalTransactionId?: string; transactionId?: string; productId?: string; appAccountToken?: string; bundleId?: string;
  purchaseDate?: number; expiresDate?: number; revocationDate?: number; price?: number; currency?: string; environment?: string;
};

function appleState(tx: AppleTx, renewal?: { autoRenewStatus?: number; gracePeriodExpiresDate?: number } | null, hint?: StoreStatus): StoreState {
  if (!tx.originalTransactionId || !tx.productId || !tx.expiresDate) throw new ApiError(400, "That App Store purchase isn't a subscription.", "store_invalid");
  const now = Date.now();
  const grace = renewal?.gracePeriodExpiresDate && renewal.gracePeriodExpiresDate > now;
  const status: StoreStatus = tx.revocationDate ? "REVOKED" : hint ?? (tx.expiresDate > now ? "ACTIVE" : grace ? "GRACE" : "EXPIRED");
  return {
    store: "APPLE", ref: tx.originalTransactionId, productId: tx.productId, accountToken: tx.appAccountToken?.toLowerCase() ?? null,
    transactionId: tx.transactionId ?? null, startsAt: new Date(tx.purchaseDate ?? now),
    expiresAt: new Date(grace ? renewal!.gracePeriodExpiresDate! : tx.expiresDate),
    autoRenew: renewal ? renewal.autoRenewStatus === 1 : true,
    status,
    // Apple reports price in thousandths of the currency unit; we store hundredths (paise, cents).
    amountMinor: typeof tx.price === "number" ? Math.round(tx.price / 10) : null,
    currency: tx.currency ?? null, environment: tx.environment ?? "Production",
  };
}

/** A purchase the iPhone just made (StoreKit 2 signed transaction, "JWS"). */
export async function verifyAppleTransaction(jws: string): Promise<StoreState> {
  const mock = fromMockToken("APPLE", jws);
  if (mock) return mock;
  const tx = await appleVerify((v) => v.verifyAndDecodeTransaction(jws)) as AppleTx;
  return appleState(tx);
}

/** App Store Server Notification V2: returns the subscription's new state, or null for notices we don't act on. */
export async function decodeAppleNotification(signedPayload: string): Promise<{ id: string; type: string; state: StoreState | null }> {
  const n = await appleVerify((v) => v.verifyAndDecodeNotification(signedPayload)) as {
    notificationUUID?: string; notificationType?: string; subtype?: string; data?: { signedTransactionInfo?: string; signedRenewalInfo?: string };
  };
  const type = `${n.notificationType ?? "UNKNOWN"}${n.subtype ? `:${n.subtype}` : ""}`;
  if (!n.data?.signedTransactionInfo) return { id: n.notificationUUID ?? type, type, state: null };
  const tx = await appleVerify((v) => v.verifyAndDecodeTransaction(n.data!.signedTransactionInfo!)) as AppleTx;
  const renewal = n.data.signedRenewalInfo ? await appleVerify((v) => v.verifyAndDecodeRenewalInfo(n.data!.signedRenewalInfo!)) as { autoRenewStatus?: number; gracePeriodExpiresDate?: number } : null;
  const hint: StoreStatus | undefined = n.notificationType === "REFUND" || n.notificationType === "REVOKE" ? "REVOKED"
    : n.notificationType === "EXPIRED" ? "EXPIRED"
    : n.notificationType === "DID_FAIL_TO_RENEW" && n.subtype === "GRACE_PERIOD" ? "GRACE" : undefined;
  return { id: n.notificationUUID ?? `${type}:${tx.transactionId}`, type, state: appleState(tx, renewal, hint) };
}

// ---------------------------------------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------------------------------------

let googleToken: { value: string; until: number } | null = null;

async function googleAccessToken() {
  if (googleToken && googleToken.until > Date.now() + 60_000) return googleToken.value;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  if (!raw || !process.env.GOOGLE_PACKAGE_NAME) throw new ApiError(503, "Google Play purchases aren't set up on the server yet.", "store_not_configured");
  const sa = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as { client_email: string; private_key: string; token_uri?: string };
  const key = await importPKCS8(sa.private_key, "RS256");
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/androidpublisher" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(sa.client_email).setAudience(tokenUri).setIssuedAt().setExpirationTime("1h").sign(key);
  const res = await fetch(tokenUri, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new ApiError(502, "Couldn't reach Google Play just now. Please try again.", "store_unavailable");
  const j = await res.json() as { access_token: string; expires_in: number };
  googleToken = { value: j.access_token, until: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

type PlaySub = {
  subscriptionState?: string; latestOrderId?: string; linkedPurchaseToken?: string; startTime?: string; testPurchase?: object;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: { productId: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean; recurringPrice?: { currencyCode?: string; units?: string; nanos?: number } } }[];
};

/** Asks Google for the current state of a subscription by its purchase token. */
export async function googleSubscription(purchaseToken: string): Promise<StoreState> {
  const mock = fromMockToken("GOOGLE", purchaseToken);
  if (mock) return mock;
  const pkg = process.env.GOOGLE_PACKAGE_NAME!;
  const token = await googleAccessToken();
  const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404 || res.status === 410 || res.status === 400) throw new ApiError(400, "That Google Play purchase couldn't be verified.", "store_invalid");
  if (!res.ok) throw new ApiError(502, "Couldn't reach Google Play just now. Please try again.", "store_unavailable");
  const s = await res.json() as PlaySub;
  const item = s.lineItems?.[0];
  if (!item?.expiryTime) throw new ApiError(400, "That Google Play purchase isn't a subscription.", "store_invalid");
  const st = s.subscriptionState ?? "";
  const status: StoreStatus = st === "SUBSCRIPTION_STATE_ACTIVE" || st === "SUBSCRIPTION_STATE_CANCELED" ? "ACTIVE"
    : st === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" ? "GRACE"
    : st === "SUBSCRIPTION_STATE_PENDING" ? "PENDING" : "EXPIRED";
  const price = item.autoRenewingPlan?.recurringPrice;
  return {
    store: "GOOGLE", ref: purchaseToken, productId: item.productId, accountToken: s.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    transactionId: s.latestOrderId ?? null, startsAt: new Date(s.startTime ?? Date.now()), expiresAt: new Date(item.expiryTime),
    autoRenew: st !== "SUBSCRIPTION_STATE_CANCELED" && item.autoRenewingPlan?.autoRenewEnabled !== false, status,
    amountMinor: price?.units ? Math.round((Number(price.units) + (price.nanos ?? 0) / 1e9) * 100) : null,
    currency: price?.currencyCode ?? null, environment: s.testPurchase ? "Sandbox" : "Production", replacesRef: s.linkedPurchaseToken ?? null,
  };
}

/** Google Play real-time developer notification (a Pub/Sub push). We only take the token from it and ask Google. */
export function decodeGoogleNotification(body: unknown): { id: string; type: string; purchaseToken: string | null } {
  const msg = (body as { message?: { data?: string; messageId?: string } })?.message;
  if (!msg?.data) throw new ApiError(400, "Not a Play notification.", "bad_request");
  const data = JSON.parse(Buffer.from(msg.data, "base64").toString("utf8")) as { subscriptionNotification?: { notificationType?: number; purchaseToken?: string }; testNotification?: object };
  const sn = data.subscriptionNotification;
  return { id: msg.messageId ?? `${sn?.purchaseToken}:${sn?.notificationType}`, type: data.testNotification ? "TEST" : `SUB_${sn?.notificationType ?? "?"}`, purchaseToken: sn?.purchaseToken ?? null };
}
