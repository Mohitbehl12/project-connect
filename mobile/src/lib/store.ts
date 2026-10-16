// In-app purchase (App Store / Google Play). This web version does nothing: the website pays with
// Razorpay. The real implementation is store.native.ts, which Metro picks on iPhone and Android.
export type StoreProduct = { id: string; displayPrice: string; offerToken?: string | null };
export type StorePurchase = { platform: "ios" | "android"; productId: string; token: string; finish: () => Promise<void> };
export type AccountIds = { appleAccountToken?: string; googleAccountId?: string };

export const storeSupported = false;
export async function connectStore(): Promise<boolean> { return false; }
export async function loadStoreProducts(_ids: string[]): Promise<Record<string, StoreProduct>> { return {}; }
export async function buyStoreProduct(_p: StoreProduct, _ids: AccountIds): Promise<void> { throw new Error("In-app purchase is only available in the app."); }
export function listenForPurchases(_onPurchase: (p: StorePurchase) => Promise<void>, _onError: (message: string) => void): () => void { return () => {}; }
export async function ownedStorePurchases(): Promise<{ platform: "ios" | "android"; tokens: string[]; finishAll: () => Promise<void> }> { return { platform: "ios", tokens: [], finishAll: async () => {} }; }
export async function openStoreSubscriptions(_productId?: string): Promise<void> {}
