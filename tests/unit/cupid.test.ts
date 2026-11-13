import { describe, expect, it } from "vitest";
import { bios, dateIdeas, openers, replies } from "../../src/lib/cupid";
import { screenMessage } from "../../src/lib/moderation";

const me = { firstName: "Ira", interests: ["coffee", "travel", "films"], city: "Pune", prompts: [], drinking: "SOCIAL", intent: "LONG_TERM" };
const them = { firstName: "Dev", interests: ["coffee", "dogs"], city: "Pune", prompts: [{ q: "I'm quietly proud of", a: "my sourdough" }], drinking: "NEVER" };
const all = (seed: number) => [...openers(me, them, seed), ...replies("Haha I just got back from Goa, what about you?", them, seed), ...dateIdeas(me, them, seed), ...bios(me, seed)];

describe("Cupid suggestions", () => {
  it("uses shared interests and public details", () => {
    expect(openers(me, them).some((i) => /coffee|dog|sourdough|Pune/i.test(i.text + i.why))).toBe(true);
    expect(dateIdeas(me, them)[0].text).toMatch(/coffee|café|walk/i);
  });
  it("respects someone who doesn't drink", () => {
    for (let s = 0; s < 20; s++) expect(openers(me, them, s).some((i) => /cocktail/i.test(i.text))).toBe(false);
  });
  it("replies pick up on the topic", () => {
    expect(replies("I just got back from a trip to Manali", them).some((i) => /✈️|next|window seat/i.test(i.text))).toBe(true);
  });
  it("never suggests anything our own safety screening would flag", () => {
    for (let s = 0; s < 30; s++) for (const i of all(s)) expect(screenMessage(i.text).filter((f) => f !== "LINK")).toEqual([]);
  });
  it("never mentions a city when the other person's city is withheld", () => {
    const hidden = { ...them, city: "" };
    for (let s = 0; s < 20; s++) for (const i of openers(me, hidden, s)) expect(i.text + i.why).not.toMatch(/Pune|both in/i);
    // Both withheld must not read as "the same city".
    for (const i of openers({ ...me, city: "" }, hidden)) expect(i.text + i.why).not.toMatch(/both in/i);
  });
  it("date ideas always say to meet somewhere public", () => {
    expect(dateIdeas(me, them).every((i) => /public/.test(i.why))).toBe(true);
  });
});
