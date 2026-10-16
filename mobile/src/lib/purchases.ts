// Tiny event channel between the background purchase checker (StoreBridge) and the screen that started
// the purchase, so the Premium screen can stop its spinner and show the result.
export type PurchaseResult = { ok: true } | { ok: false; message: string };
const subs = new Set<(r: PurchaseResult) => void>();
export function onPurchaseResult(cb: (r: PurchaseResult) => void) { subs.add(cb); return () => { subs.delete(cb); }; }
export function emitPurchaseResult(r: PurchaseResult) { subs.forEach((cb) => cb(r)); }
