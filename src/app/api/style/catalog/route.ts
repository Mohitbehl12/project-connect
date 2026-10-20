import { ok, route } from "@/lib/http";
import * as D from "@/lib/style/darzi.js";

/** The clothing catalogue and design options (the app also has these built in; this is the server's view). */
export const GET = route(async () => ok({
  categories: Object.entries(D.CATS).map(([key, c]) => ({ key, ...c })),
  colors: D.COLORS, fabrics: D.FABRIC, patterns: D.PATTERNS, fits: D.FITS, statuses: D.STATUSES,
  items: D.CATALOG.map((i) => ({ ...i, description: D.describe(i.spec) })),
}));
