import { describe, expect, it } from "vitest";
import { resolvePlace, searchPlaces } from "../../src/lib/places";

describe("world places", () => {
  it("finds towns and cities anywhere, biggest first", () => {
    const show = (q: string) => searchPlaces(q, { limit: 3 }).map((p) => `${p.label}|${p.country}`);
    console.log(["lucknow", "sao paulo", "springfield illinois", "paris", "nairobi", "gurgaon", "shimla"].map((q) => `${q}: ${show(q).join(" ; ")}`).join("\n"));
    expect(searchPlaces("lucknow")[0]).toMatchObject({ country: "IN", name: "Lucknow" });
    expect(searchPlaces("luck")[0]).toMatchObject({ country: "IN", name: "Lucknow" }); // a big city beats a tiny exact match
    expect(searchPlaces("sao paulo")[0]).toMatchObject({ country: "BR" });
    expect(searchPlaces("paris")[0]).toMatchObject({ country: "FR" });
    expect(searchPlaces("nairobi")[0]).toMatchObject({ country: "KE" });
    expect(searchPlaces("springfield illinois")[0]).toMatchObject({ country: "US", region: "Illinois" });
    expect(searchPlaces("xyzzyq")).toEqual([]);
  });
  it("maps a world place onto the quick-pick city, so existing members and filters keep working", () => {
    expect(searchPlaces("delhi")[0]).toMatchObject({ key: "Delhi", label: "Delhi", country: "IN" });
    expect(searchPlaces("mumbai")[0]).toMatchObject({ key: "Mumbai" });
  });
  it("resolves keys back to a place, and refuses unknown ones", () => {
    const k = searchPlaces("nairobi")[0].key;
    expect(resolvePlace(k)).toMatchObject({ country: "KE", lat: expect.any(Number) });
    expect(resolvePlace("Delhi")).toMatchObject({ country: "IN" });
    expect(resolvePlace("Atlantis")).toBeNull();
  });
  it("can be limited to one country, and is fast", () => {
    expect(searchPlaces("delhi", { country: "US" }).every((p) => p.country === "US")).toBe(true);
    const t = performance.now(); for (let i = 0; i < 20; i++) searchPlaces("san"); expect((performance.now() - t) / 20).toBeLessThan(150);
  });
});
