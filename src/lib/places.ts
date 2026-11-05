import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { CITIES, COUNTRIES } from "./constants";

// Every town and city in the world (GeoNames, 1,000+ people), so members can say where they're based anywhere.
// The curated CITIES list stays as the quick picks; a world place that is one of them uses the curated key, so
// existing members, filters and ads targeting keep working. Location is still the city centre — never GPS.

export type Place = { key: string; name: string; region: string; country: string; countryName: string; label: string; lat: number; lng: number; population: number };

type Row = [string, string, number, string, number, number, number];
let data: { rows: Row[]; regions: string[]; byKey: Map<string, Row>; folded: string[]; attribution: string } | null = null;

export const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
export const countryName = (cc: string) => COUNTRIES[cc]?.name ?? (() => { try { return regionNames?.of(cc) ?? cc; } catch { return cc; } })();

function load() {
  if (data) return data;
  const file = path.join(process.cwd(), "src/lib/geo/world-cities.json.gz");
  const raw = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as { rows: Row[]; regions: string[]; attribution: string };
  data = { ...raw, byKey: new Map(raw.rows.map((r) => [r[0], r])), folded: raw.rows.map((r) => fold(r[1])) };
  return data;
}

/** Curated key for a world place that is one of the quick-pick cities (same country, same name, within ~40 km). */
function curatedFor(name: string, country: string, lat: number, lng: number) {
  const n = fold(name);
  const hit = Object.entries(CITIES).find(([k, c]) => c.country === country && (fold(k) === n || (n === "new delhi" && k === "Delhi") || (n === "bangalore" && k === "Bengaluru")) && Math.abs(c.lat - lat) < 0.4 && Math.abs(c.lng - lng) < 0.4);
  return hit?.[0] ?? null;
}

function toPlace(r: Row): Place {
  const d = load();
  const [key, name, ri, country, lat, lng, population] = r;
  const curated = curatedFor(name, country, lat, lng);
  if (curated) { const c = CITIES[curated]; return { key: curated, name: curated, region: "", country: c.country, countryName: countryName(c.country), label: curated, lat: c.lat, lng: c.lng, population }; }
  const region = ri >= 0 ? d.regions[ri] : "";
  const label = region && fold(region) !== fold(name) ? `${name}, ${region}` : name;
  return { key, name, region, country, countryName: countryName(country), label, lat, lng, population };
}

/** A quick-pick city key or a world place key → the place, or null. */
export function resolvePlace(keyOrCity: string): Place | null {
  const c = CITIES[keyOrCity];
  if (c) return { key: keyOrCity, name: keyOrCity, region: "", country: c.country, countryName: countryName(c.country), label: keyOrCity, lat: c.lat, lng: c.lng, population: 0 };
  const r = load().byKey.get(keyOrCity);
  return r ? toPlace(r) : null;
}

/**
 * Search by name ("lucknow", "sao paulo", "springfield il"). Exact names first, then names that start with the
 * text, then names containing a word that does; bigger places first within each. Optional country filter.
 */
// Old or everyday names people type that the gazetteer lists differently.
const ALIASES: Record<string, string> = { gurgaon: "gurugram", bombay: "mumbai", bangalore: "bengaluru", madras: "chennai", calcutta: "kolkata", poona: "pune", baroda: "vadodara", trivandrum: "thiruvananthapuram", cochin: "kochi", mysore: "mysuru", "new york city": "new york", nyc: "new york", "la": "los angeles" };

export function searchPlaces(q: string, opts: { country?: string; limit?: number } = {}): Place[] {
  const alias = ALIASES[fold(q)];
  if (alias) q = alias;
  const d = load();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const parts = fold(q).split(" ").filter(Boolean);
  if (!parts.length) return [];
  const want = parts.join(" ");
  const out: { r: Row; score: number }[] = [];
  for (let i = 0; i < d.rows.length; i++) {
    const r = d.rows[i];
    if (opts.country && r[3] !== opts.country) continue;
    const n = d.folded[i];
    let score = -1;
    if (n === want) score = 3;
    else if (n.startsWith(want)) score = 2;
    else if (n.includes(` ${want}`)) score = 1;
    else if (parts.length > 1) {
      // "springfield illinois" / "paris france": name + region or country words
      const region = r[2] >= 0 ? fold(d.regions[r[2]]) : "";
      const extra = `${region} ${fold(countryName(r[3]))} ${r[3].toLowerCase()}`;
      const [first, ...rest] = parts;
      if (n.startsWith(first) && rest.every((w) => extra.includes(w))) score = 1.5;
    }
    if (score >= 0) out.push({ r, score });
  }
  // How well the name matches, plus how big the place is: "luck" puts Lucknow (3.4 million) above Luck, Wisconsin
  // (1,000), while "paris" still puts Paris, France first.
  const rank = (x: { r: Row; score: number }) => x.score + Math.log10(x.r[6] + 10) * 0.6;
  out.sort((a, b) => rank(b) - rank(a));
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const { r } of out) {
    const p = toPlace(r);
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    places.push(p);
    if (places.length >= limit) break;
  }
  return places;
}

export const placesAttribution = () => load().attribution;
