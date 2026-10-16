// Product ids for App Store / Google Play subscriptions. Pure: shared by the seed and the server.
// Pattern: <plan>[_men]_<months>m, e.g. premium_1m, premium_men_12m, plus_1m. Create the same ids in
// App Store Connect and Play Console (docs/STORES.md lists them).
const PLAN_KEY: Record<string, string> = { PREMIUM: "premium", PREMIUM_PLUS: "plus", VIP: "vip" };

export function storeProductId(planCode: string, segment: string, durationDays: number): string | null {
  const plan = PLAN_KEY[planCode];
  if (!plan) return null;
  const months = Math.max(1, Math.round(durationDays / 30.4));
  const group = segment === "gender:MAN" ? "_men" : segment === "*" ? "" : null;
  if (group === null) return null;
  return `${plan}${group}_${months}m`;
}
