import { describe, expect, it } from "vitest";
import { screenMessage, warningFor } from "../../src/lib/moderation";
import { conversationStarters } from "../../src/lib/starters";

describe("screenMessage", () => {
  it("passes ordinary conversation", () => {
    expect(screenMessage("Haha, I love that place. Shall we try the dosa next time?")).toEqual([]);
    expect(screenMessage("I'm investing a lot of time in learning guitar")).toEqual([]);
  });
  it("flags money and investment scams", () => {
    expect(screenMessage("I can show you a crypto trading platform with guaranteed profit")).toContain("SCAM");
    expect(screenMessage("Can you send me money for the visa fee? I'm stuck at the airport")).toContain("SCAM");
    expect(screenMessage("buy me a gift card please")).toContain("SCAM");
  });
  it("flags moves off-platform, links and contact details", () => {
    expect(screenMessage("add me on whatsapp")).toContain("OFF_PLATFORM");
    expect(screenMessage("check https://bit.ly/abc")).toContain("LINK");
    expect(screenMessage("my number is +91 98765 43210")).toContain("CONTACT_INFO");
    expect(screenMessage("mail me at someone@example.com")).toContain("CONTACT_INFO");
  });
  it("flags abuse in English and Hindi slang", () => {
    expect(screenMessage("you are so stupid")).toContain("ABUSE");
    expect(screenMessage("chutiya")).toContain("ABUSE");
  });
  it("gives the most important warning first", () => {
    expect(warningFor(["LINK", "SCAM"])).toMatch(/money/);
    expect(warningFor([])).toBeNull();
  });
});

describe("conversationStarters", () => {
  it("uses shared interests and public prompts only", () => {
    const s = conversationStarters(
      { interests: ["coffee", "dogs"], city: "Pune" },
      { interests: ["dogs", "cricket"], city: "Pune", prompts: [{ q: "I'm quietly proud of", a: "my sourdough" }], firstName: "Ira" },
    );
    expect(s[0].tip).toMatch(/dog/i);
    expect(s.some((x) => x.text.includes("my sourdough"))).toBe(true);
    expect(s.some((x) => x.tip.includes("Pune"))).toBe(true);
    expect(s.length).toBeLessThanOrEqual(4);
  });
});
