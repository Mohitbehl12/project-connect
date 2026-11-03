import { describe, expect, it } from "vitest";
import { CLOSING_NOTES } from "../../src/lib/closeKindly";
import { inQuietHours, localHour } from "../../src/lib/notify";
import { weekStart } from "../../src/lib/productReport";
import { screenMessage } from "../../src/lib/moderation";

describe("quiet hours", () => {
  it.each([
    [23, 22, 7, true], [3, 22, 7, true], [7, 22, 7, false], [12, 22, 7, false], [22, 22, 7, true],
    [0, 0, 9, true], [9, 0, 9, false], [14, 13, 15, true], [15, 13, 15, false],
  ])("hour %i in %i→%i is %s", (h, a, b, want) => expect(inQuietHours(h, a, b)).toBe(want));
  it("off when unset or equal", () => { expect(inQuietHours(3, null, null)).toBe(false); expect(inQuietHours(3, 5, 5)).toBe(false); });
  it("uses the member's time zone", () => {
    const at = new Date("2026-11-03T18:00:00Z"); // 23:30 in India
    expect(localHour("Asia/Kolkata", at)).toBe(23);
    expect(localHour("Europe/London", at)).toBe(18);
    expect(localHour("Not/AZone", at)).toBe(18);
  });
});

describe("weekly report weeks", () => {
  it("start on Monday 00:00 UTC", () => {
    expect(weekStart(new Date("2026-11-03T16:00:00Z")).toISOString()).toBe("2026-11-02T00:00:00.000Z"); // Tuesday
    expect(weekStart(new Date("2026-11-08T23:59:00Z")).toISOString()).toBe("2026-11-02T00:00:00.000Z"); // Sunday
    expect(weekStart(new Date("2026-11-09T00:00:00Z")).toISOString()).toBe("2026-11-09T00:00:00.000Z"); // Monday
  });
});

describe("closing a conversation kindly", () => {
  it.each(Object.entries(CLOSING_NOTES))("%s is kind: screening finds nothing to flag", (_k, note) => {
    expect(screenMessage(note)).toEqual([]);
    expect(note.length).toBeLessThan(200);
  });
});
