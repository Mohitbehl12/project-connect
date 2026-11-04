import { describe, expect, it } from "vitest";
import data from "../fixtures/screening-cases.json";
import { screenMessage, type Flag } from "../../src/lib/moderation";

// Measures each screening rule against labelled cases: precision (when it flags, a person would agree) and
// recall (of the cases it should catch, how many it does). Known gaps are reported, not failed.
type Case = { text: string; expect: string[]; knownGap?: boolean };
const cases = (data as { cases: Case[] }).cases;
const FLAGS: Flag[] = ["SCAM", "FINANCIAL_INFO", "THREAT", "RISKY_LINK", "LINK", "OFF_PLATFORM", "CONTACT_INFO", "ABUSE", "MINOR"];

describe("screening rules against labelled cases", () => {
  const results = cases.map((c) => ({ ...c, got: screenMessage(c.text) as string[] }));
  const table = FLAGS.map((f) => {
    const tp = results.filter((r) => r.expect.includes(f) && r.got.includes(f)).length;
    const fp = results.filter((r) => !r.expect.includes(f) && r.got.includes(f)).length;
    const fn = results.filter((r) => r.expect.includes(f) && !r.got.includes(f)).length;
    return { flag: f, precision: tp + fp ? tp / (tp + fp) : 1, recall: tp + fn ? tp / (tp + fn) : 1, tp, fp, fn };
  });

  it("never flags a case a person said was fine (precision 100% on the set)", () => {
    const wrong = results.filter((r) => r.got.some((g) => !r.expect.includes(g)));
    expect(wrong.map((w) => `${w.text} → ${w.got.join(",")}`)).toEqual([]);
  });
  it("catches every case it is expected to catch, apart from the listed known gaps", () => {
    const missed = results.filter((r) => !r.knownGap && r.expect.some((e) => !r.got.includes(e)));
    expect(missed.map((m) => `${m.text} → wanted ${m.expect.join(",")}, got ${m.got.join(",") || "nothing"}`)).toEqual([]);
  });
  it("reports precision and recall per rule", () => {
    console.table(table.map((t) => ({ rule: t.flag, precision: `${Math.round(t.precision * 100)}%`, recall: `${Math.round(t.recall * 100)}%`, cases: t.tp + t.fn })));
    const gaps = results.filter((r) => r.knownGap && r.expect.some((e) => !r.got.includes(e)));
    console.log(`Known gaps still missed: ${gaps.length}`);
    expect(table.every((t) => t.precision === 1)).toBe(true);
  });
});
