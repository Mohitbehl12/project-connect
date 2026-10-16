// In-app purchase on iPhone (StoreKit 2) and Android (Play Billing) through expo-iap.
// The phone never decides whether a purchase is real: every purchase goes to our server, which checks it
// with Apple or Google, and only then is the transaction finished. Unfinished ones are retried on next launch.
import Constants from "expo-constants";
import {
  deepLinkToSubscriptions, fetchProducts, finishTransaction, getAvailablePurchases, initConnection,
  isUserCancelledError, purchaseErrorListener, purchaseUpdatedListener, requestPurchase,
  type Purchase, type ProductSubscription,
} from "expo-iap";
import { Platform } from "react-native";
import type { AccountIds, StoreProduct, StorePurchase } from "./store";

export type { AccountIds, StoreProduct, StorePurchase } from "./store";
export const storeSupported = Platform.OS === "ios" || Platform.OS === "android";
const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";

let connected: Promise<boolean> | null = null;
export function connectStore() {
  connected ??= initConnection().then(() => true).catch(() => { connected = null; return false; });
  return connected;
}

export async function loadStoreProducts(ids: string[]): Promise<Record<string, StoreProduct>> {
  if (!ids.length || !(await connectStore())) return {};
  const list = (await fetchProducts({ skus: ids, type: "subs" })) as ProductSubscription[] | null;
  const out: Record<string, StoreProduct> = {};
  for (const p of list ?? []) {
    // Android: a subscription is bought through one of its base-plan offers; take the first.
    const offer = "subscriptionOffers" in p ? p.subscriptionOffers?.find((o) => o.offerTokenAndroid) : undefined;
    out[p.id] = { id: p.id, displayPrice: p.displayPrice, offerToken: offer?.offerTokenAndroid ?? null };
  }
  return out;
}

/** Opens the store's payment sheet. The result arrives through listenForPurchases. */
export async function buyStoreProduct(p: StoreProduct, ids: AccountIds) {
  if (!(await connectStore())) throw new Error("Couldn't reach the store. Check your connection and try again.");
  await requestPurchase({
    type: "subs",
    request: {
      apple: { sku: p.id, appAccountToken: ids.appleAccountToken },
      google: { skus: [p.id], obfuscatedAccountId: ids.googleAccountId, subscriptionOffers: p.offerToken ? [{ sku: p.id, offerToken: p.offerToken }] : undefined },
    },
  });
}

const asPurchase = (x: Purchase): StorePurchase | null =>
  x.purchaseToken && x.purchaseState !== "pending"
    ? { platform, productId: x.productId, token: x.purchaseToken, finish: () => finishTransaction({ purchase: x, isConsumable: false }) }
    : null;

/** Keep mounted while the app runs: verifies each completed purchase with the server, then finishes it. */
export function listenForPurchases(onPurchase: (p: StorePurchase) => Promise<void>, onError: (message: string) => void) {
  let alive = true;
  connectStore().then((ok) => {
    if (!ok || !alive) return;
    // Purchases that finished while the app was closed (or whose check failed) come back here.
    getAvailablePurchases().then((list) => list?.forEach((x) => { const p = asPurchase(x); if (p) onPurchase(p).catch(() => {}); })).catch(() => {});
  });
  const a = purchaseUpdatedListener((x) => {
    if (x.purchaseState === "pending") { onError("Your payment is pending. Premium turns on as soon as the store confirms it."); return; }
    const p = asPurchase(x);
    if (p) onPurchase(p).catch(() => {});
  });
  const b = purchaseErrorListener((e) => { if (!isUserCancelledError(e)) onError(e.message || "The purchase didn't go through."); });
  return () => { alive = false; a.remove(); b.remove(); };
}

/** For "Restore purchases": every subscription this Apple ID / Google account holds for the app. */
export async function ownedStorePurchases() {
  if (!(await connectStore())) return { platform, tokens: [] as string[], finishAll: async () => {} };
  const list = (await getAvailablePurchases()) ?? [];
  const ps = list.map(asPurchase).filter((p): p is StorePurchase => !!p);
  return { platform, tokens: ps.map((p) => p.token), finishAll: async () => { await Promise.all(ps.map((p) => p.finish().catch(() => {}))); } };
}

/** The store's own subscription settings, where members cancel or change store-billed plans. */
export async function openStoreSubscriptions(productId?: string) {
  const pkg = Constants.expoConfig?.android?.package ?? null;
  await deepLinkToSubscriptions(Platform.OS === "android" ? { skuAndroid: productId ?? null, packageNameAndroid: pkg } : {});
}
