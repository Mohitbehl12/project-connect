// Builds src/lib/geo/world-cities.json.gz: every town and city in the world with 1,000+ people (or an
// administrative seat), from the GeoNames gazetteer, ranked by population from the SimpleMaps basic database.
// Both are licensed CC BY 4.0 — the attribution is shown on the About page.
//
// To refresh (the packages are needed only here, never at runtime):
//   npm i --no-save cities.json world-cities-json && node scripts/build-world-cities.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const cities = require("cities.json/cities.json");
const admin1 = require("cities.json/admin1.json");
const smDir = require("node:path").dirname(require.resolve("world-cities-json/package.json"));
const simplemaps = require(`${smDir}/data/cities.json`);

const fold = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const regionName = new Map(admin1.map((a) => [a.code, a.name]));

// Population lookup: same country, same folded name, within ~30 km.
const pop = new Map();
for (const s of simplemaps) {
  const k = `${s.iso2}|${fold(s.city_ascii || s.city)}`;
  (pop.get(k) ?? pop.set(k, []).get(k)).push({ lat: +s.lat, lng: +s.lng, p: +s.population || 0 });
}
const populationOf = (c) => {
  const near = (pop.get(`${c.country}|${fold(c.name)}`) ?? []).filter((x) => Math.abs(x.lat - +c.lat) < 0.3 && Math.abs(x.lng - +c.lng) < 0.3);
  return near.length ? Math.max(...near.map((x) => x.p)) : 0;
};

const regions = [];
const regionIdx = new Map();
const rIdx = (name) => {
  if (!name) return -1;
  if (!regionIdx.has(name)) { regionIdx.set(name, regions.length); regions.push(name); }
  return regionIdx.get(name);
};

const seen = new Set();
const rows = [];
for (const c of cities) {
  const region = regionName.get(`${c.country}.${c.admin1}`) ?? "";
  const lat = Math.round(+c.lat * 1000) / 1000, lng = Math.round(+c.lng * 1000) / 1000;
  // Stable key: country, region code and name; the rounded position only when that isn't unique.
  let key = `${c.country}.${c.admin1 || "0"}.${fold(c.name).replace(/ /g, "-")}`;
  if (seen.has(key)) key = `${key}.${lat},${lng}`;
  if (seen.has(key)) continue; // exact duplicate
  seen.add(key);
  rows.push([key, c.name, rIdx(region), c.country, lat, lng, populationOf(c)]);
}
rows.sort((a, b) => b[6] - a[6]);
const out = {
  version: new Date().toISOString().slice(0, 10),
  attribution: "City data © GeoNames (geonames.org) and SimpleMaps (simplemaps.com/data/world-cities), CC BY 4.0",
  columns: ["key", "name", "region", "country", "lat", "lng", "population"],
  regions, rows,
};
const gz = gzipSync(JSON.stringify(out), { level: 9 });
writeFileSync(new URL("../src/lib/geo/world-cities.json.gz", import.meta.url), gz);
console.log(`${rows.length} places, ${regions.length} regions, ${(gz.length / 1e6).toFixed(1)} MB gzipped, ${rows.filter((r) => r[6]).length} with population`);
