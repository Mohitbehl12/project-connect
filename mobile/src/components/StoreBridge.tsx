import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { emitPurchaseResult } from "@/lib/purchases";
import { listenForPurchases, storeSupported } from "@/lib/store";

// Errors that mean "this purchase will never be accepted for this account": finish it so the store stops
// re-sending it. Anything else (network, server not ready) is left unfinished and retried on next launch.
const FINAL = new Set(["store_other_account", "store_invalid", "store_unknown_product", "store_mismatch"]);

/** Runs in the background while signed in: every completed store purchase is checked by our server first. */
export function StoreBridge() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const signedIn = !!me?.user?.id;
  useEffect(() => {
    if (!storeSupported || !signedIn) return;
    return listenForPurchases(async (p) => {
      try {
        await api("/api/billing/store/verify", { body: { platform: p.platform, token: p.token, productId: p.productId } });
        await p.finish();
        haptic.success();
        emitPurchaseResult({ ok: true });
        qc.invalidateQueries({ queryKey: ["catalogue"] });
        qc.invalidateQueries({ queryKey: ["subscription"] });
        qc.invalidateQueries({ queryKey: ["me"] });
      } catch (e) {
        const code = e instanceof ApiError ? e.code : undefined;
        if (code && FINAL.has(code)) await p.finish().catch(() => {});
        emitPurchaseResult({ ok: false, message: (e as Error).message || "We couldn't confirm the purchase yet. We'll try again shortly." });
      }
    }, (message) => emitPurchaseResult({ ok: false, message }));
  }, [signedIn, qc]);
  return null;
}
