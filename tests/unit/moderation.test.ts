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
  it("flags requests for codes, PINs and bank details", () => {
    expect(screenMessage("please send me the OTP you just got")).toContain("FINANCIAL_INFO");
    expect(screenMessage("what's your UPI PIN")).toContain("FINANCIAL_INFO");
    expect(screenMessage("share your bank account and IFSC")).toContain("FINANCIAL_INFO");
    expect(screenMessage("I sent you an OTP joke lol")).not.toContain("FINANCIAL_INFO");
  });
  it("flags threats and sextortion", () => {
    expect(screenMessage("I know where you live")).toContain("THREAT");
    expect(screenMessage("I will find you")).toContain("THREAT");
    expect(screenMessage("pay me or I'll leak your photos")).toContain("THREAT");
    expect(screenMessage("I'll find you a good book")).not.toContain("THREAT");
  });
  it("refuses risky links but not ordinary ones", () => {
    expect(screenMessage("check https://bit.ly/abc")).toContain("RISKY_LINK");
    expect(screenMessage("go to http://192.168.1.20/login")).toContain("RISKY_LINK");
    expect(screenMessage("install this kinara-pro.apk")).toContain("RISKY_LINK");
    expect(screenMessage("menu at https://www.example.com/cafe")).not.toContain("RISKY_LINK");
  });
  it("gives the most important warning first", () => {
    expect(warningFor(["SCAM", "THREAT"])).toMatch(/threat/);
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

describe("possible-minor signal (child safety)", () => {
  const minor = (t: string) => screenMessage(t).includes("MINOR");
  it("flags people saying they are under 18", () => {
    for (const t of ["hi, I'm 16", "im 15 yo", "I am 17 years old", "i'm only 14", "I'm not 18 yet", "I am under 18", "i'm a minor lol",
      "I'm in class 11", "im in 10th", "I am studying in std 9", "I'm turning 18 next month", "my age is 16", "main 16 saal ki hoon", "meri umar 15 hai", "I'm still in school"])
      expect(minor(t), t).toBe(true);
  });
  it("ignores adults, distances, durations and other people", () => {
    for (const t of ["I'm 26", "I'm 10 minutes away", "I'm 15 years into my career", "I'm 12 km from you", "I'm 17th in the marathon list",
      "my nephew is 16", "I was 16 when I learned guitar", "I'm in 12th year of work", "I'm in 11th semester? no, just kidding", "I'm 30 and love dosa",
      "I'm 18", "my age is 27", "I'm in class? nope, at the office"])
      expect(minor(t), t).toBe(false);
  });
  it("tells the adult receiving it what to do", () => {
    expect(warningFor(["MINOR"])).toMatch(/only for adults/);
  });
});
