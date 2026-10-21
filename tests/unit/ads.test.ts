import { describe, expect, it } from "vitest";
import { Targeting, autoCheck, checkUrl, makeToken, matchesTargeting, readToken, whyText } from "../../src/lib/ads";

process.env.AUTH_SECRET ||= "unit-test-secret-unit-test-secret";
const T = (o: object = {}) => Targeting.parse(o);
const viewer = { country: "IN", city: "Delhi", age: 28, gender: "WOMAN", interests: ["coffee", "travel"], device: "ios", language: "en", personalised: true };
const creative = (headline: string, description = "", url = "https://shop.example.com") => ({ headline, description, cta: "LEARN_MORE", url, logoKey: null, imageKeys: [], videoKey: null });

describe("ad targeting", () => {
  it("matches broad location, age, device and language", () => {
    expect(matchesTargeting(T({ regions: ["Delhi NCR"], ageMin: 21, ageMax: 35 }), viewer)).toBe(true);
    expect(matchesTargeting(T({ cities: ["Mumbai"] }), viewer)).toBe(false);
    expect(matchesTargeting(T({ countries: ["GB"] }), viewer)).toBe(false);
    expect(matchesTargeting(T({ ageMin: 30 }), viewer)).toBe(false);
    expect(matchesTargeting(T({ devices: ["android"] }), viewer)).toBe(false);
    expect(matchesTargeting(T({ languages: ["hi"] }), viewer)).toBe(false);
  });
  it("uses gender and interests only when the member has personalised ads on", () => {
    expect(matchesTargeting(T({ genders: ["WOMAN"], interests: ["coffee"] }), viewer)).toBe(true);
    const off = { ...viewer, personalised: false, gender: null, interests: [] };
    expect(matchesTargeting(T({ genders: ["WOMAN"] }), off)).toBe(false);
    expect(matchesTargeting(T({ interests: ["coffee"] }), off)).toBe(false);
    expect(matchesTargeting(T({ regions: ["Delhi NCR"] }), off)).toBe(true); // location still works
  });
  it("refuses under-18 audiences and unknown (sensitive) fields", () => {
    expect(() => T({ ageMin: 16 })).toThrow();
    expect(() => T({ ageMin: 40, ageMax: 30 })).toThrow();
    expect(T({ religion: ["any"] } as object)).not.toHaveProperty("religion");
  });
  it("explains 'why' without anything sensitive", () => {
    const w = whyText("Chai Co", T({ regions: ["Delhi NCR"], interests: ["coffee"], genders: ["WOMAN"] }), viewer);
    expect(w).toMatch(/Delhi NCR/);
    expect(w).toMatch(/never see who you are/);
    expect(w).not.toMatch(/woman|gender|age 28/i);
  });
});

describe("automatic ad checks", () => {
  it("rejects prohibited content outright", () => {
    expect(autoCheck({ name: "x", category: "FINANCE", creative: creative("Guaranteed returns — double your money") }).hard.length).toBeGreaterThan(0);
    expect(autoCheck({ name: "x", category: "RETAIL", creative: creative("First copy designer bags") }).hard).toContain("Counterfeit goods");
    expect(autoCheck({ name: "x", category: "OTHER", creative: creative("Escort service tonight") }).hard.length).toBeGreaterThan(0);
    expect(autoCheck({ name: "x", category: "APPS", creative: creative("Spy on your girlfriend's phone") }).hard.length).toBeGreaterThan(0);
  });
  it("sends regulated categories and big claims to a person", () => {
    const r = autoCheck({ name: "x", category: "ALCOHOL", creative: creative("The No. 1 craft beer in town") });
    expect(r.hard).toEqual([]);
    expect(r.soft.join(" ")).toMatch(/Regulated category/);
    expect(r.soft.join(" ")).toMatch(/Superlative/);
  });
  it("passes an ordinary ad", () => {
    expect(autoCheck({ name: "Weekend", category: "FOOD", creative: creative("Candlelit dinner for two", "20% off this weekend") })).toEqual({ hard: [], soft: [] });
  });
  it("checks landing pages", () => {
    expect(checkUrl("https://cafe.example.com/menu")).toBeNull();
    expect(checkUrl("http://cafe.example.com")).toMatch(/https/);
    expect(checkUrl("https://bit.ly/x")).toMatch(/shorteners/);
    expect(checkUrl("https://192.168.1.1/")).toMatch(/IP/);
    expect(checkUrl("https://user:pass@cafe.example.com")).toMatch(/login/);
    expect(checkUrl("https://xn--80ak6aa92e.com")).toMatch(/punycode/);
  });
});

describe("ad tokens", () => {
  it("round-trip and can't be edited", () => {
    const t = makeToken("camp1", "viewerhash", "FEED");
    expect(readToken(t)).toEqual({ campaignId: "camp1", viewer: "viewerhash", placement: "FEED" });
    const [body, sig] = t.split(".");
    const forged = Buffer.from(Buffer.from(body, "base64url").toString().replace("camp1", "camp2")).toString("base64url");
    expect(readToken(`${forged}.${sig}`)).toBeNull();
    expect(readToken("garbage")).toBeNull();
  });
});
