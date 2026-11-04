import { describe, expect, it } from "vitest";
import { appealOverturns, reviewTimes, screeningPrecision } from "../../src/lib/moderationQuality";
import { reviewDue, reviewPromise } from "../../src/lib/reportSla";

const t0 = new Date("2026-11-01T00:00:00Z");
const rep = (o: Partial<{ category: string; automated: boolean; status: string; priority: string; resolvedAfterH: number | null }>) => {
  const r = { category: o.category ?? "SCAM", automated: o.automated ?? true, status: o.status ?? "OPEN", priority: o.priority ?? "HIGH", createdAt: t0,
    resolvedAt: o.resolvedAfterH == null ? null : new Date(t0.getTime() + o.resolvedAfterH * 3600_000) };
  return { ...r, ...reviewDue(r, t0.getTime() + 30 * 3600_000) };
};

describe("report review targets", () => {
  it("sets a due time by priority and flags overdue open reports", () => {
    const now = t0.getTime() + 13 * 3600_000;
    expect(reviewDue({ priority: "CRITICAL", createdAt: t0, status: "OPEN" }, now)).toMatchObject({ reviewHours: 12, overdue: true });
    expect(reviewDue({ priority: "CRITICAL", createdAt: t0, status: "ACTIONED" }, now).overdue).toBe(false);
    expect(reviewDue({ priority: "LOW", createdAt: t0, status: "OPEN" }, now)).toMatchObject({ reviewHours: 168, overdue: false });
  });
  it("tells members a target in plain words", () => {
    expect(reviewPromise("CRITICAL")).toBe("usually within 12 hours");
    expect(reviewPromise("MEDIUM")).toBe("usually within 3 days");
  });
});

describe("moderation quality", () => {
  it("measures false positives of automated screening", () => {
    const rows = screeningPrecision([rep({ status: "ACTIONED" }), rep({ status: "DISMISSED" }), rep({ status: "DISMISSED" }), rep({}), rep({ automated: false, status: "DISMISSED" })]);
    expect(rows).toEqual([{ category: "SCAM", filed: 4, actioned: 1, dismissed: 2, open: 1, precisionPct: 33.3, falsePositivePct: 66.7 }]);
  });
  it("measures appeal overturns per system, and for staff decisions", () => {
    const rows = appealOverturns([{ id: "d1", system: "rules:a", kind: "X" }, { id: "d2", system: "rules:a", kind: "X" }],
      [{ kind: "AUTOMATED", refId: "d1", status: "OVERTURNED" }, { kind: "SUSPENSION", refId: "m9", status: "UPHELD" }]);
    expect(rows).toEqual([{ system: "rules:a", decisions: 2, appealed: 1, overturned: 1, overturnPct: 100 }, { system: "staff decisions", decisions: 0, appealed: 1, overturned: 0, overturnPct: 0 }]);
  });
  it("reports review times against targets", () => {
    const r = reviewTimes([rep({ priority: "CRITICAL", status: "ACTIONED", resolvedAfterH: 2 }), rep({ priority: "CRITICAL", status: "ACTIONED", resolvedAfterH: 20 }), rep({ priority: "CRITICAL" })]);
    expect(r[0]).toEqual({ priority: "CRITICAL", open: 1, overdue: 1, reviewed: 2, onTime: 1, medianHours: 2 });
  });
});
