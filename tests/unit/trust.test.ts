import { describe, expect, it } from "vitest";
import { URGENCY } from "../../src/lib/admin-billing";
import { decide } from "../../src/lib/photoScreen";

describe("photo screening decisions", () => {
  it("refuses explicit photos, holds borderline ones, passes the rest", () => {
    expect(decide({ sexual_activity: 0.9 }).status).toBe("REJECTED");
    expect(decide({ sexual_display: 0.3, none: 0.6 }).status).toBe("PENDING");
    expect(decide({ suggestive: 0.8, none: 0.15, sexual_display: 0.01 }).status).toBe("LIVE"); // swimwear is fine
    expect(decide(undefined).status).toBe("LIVE");
  });
});

describe("false urgency in offers", () => {
  it("spots urgency wording", () => {
    for (const t of ["Today only", "Ends soon!", "Last chance", "Hurry", "limited time deal", "Expires today"]) expect(URGENCY.test(t)).toBe(true);
    for (const t of ["Festival offer", "Welcome offer", "Welcome back", "Diwali special"]) expect(URGENCY.test(t)).toBe(false);
  });
});
