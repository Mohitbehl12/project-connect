import { AD_CATEGORIES, CTAS, OBJECTIVES, PLACEMENTS, PRICING, REGIONS, REPORT_REASONS } from "@/lib/ads";
import { getConfig } from "@/lib/config";
import { CITIES, COUNTRIES, GENDERS, INTERESTS } from "@/lib/constants";
import { ok, publicRoute } from "@/lib/http";

/** Everything the ad builder needs: options, regions and the current prices. */
export const GET = publicRoute(async () => ok({
  objectives: OBJECTIVES, ctas: CTAS, placements: PLACEMENTS, pricingModels: PRICING, categories: AD_CATEGORIES, reportReasons: REPORT_REASONS,
  regions: REGIONS, cities: Object.keys(CITIES), countries: Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [k, v.name])), genders: GENDERS, interests: INTERESTS,
  prices: await getConfig("ads.pricing"), minDailyBudgetMinor: await getConfig("ads.minDailyBudgetMinor"), minTopupMinor: await getConfig("ads.minTopupMinor"),
}));
