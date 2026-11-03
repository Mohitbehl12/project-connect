import { describe, expect, it } from "vitest";
import { OPS_BANDS, bucketOf, fingerprint, percentile, riskBand, riskScore, routeKey, scrub, severityFor, stackTop } from "../../src/lib/ops";

describe("ops: scrubbing keeps personal data and secrets out of incidents", () => {
  it.each([
    ["Cannot send to priya.sharma+test@example.co.in", "<email>"],
    ["call +91 98765 43210 now", "<number>"],
    ["Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF123_-", "<token>"],
    [`key ${"rzp"}_live_AbCdEf12345678 failed`, "<secret>"],
    [`token ${"ghp"}_abcdefghijklmnopqrstuvwxyz0123456789`, "<secret>"],
    ["user 3f2b1c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f not found", ":id"],
  ])("%s", (input, marker) => {
    const out = scrub(input);
    expect(out).toContain(marker);
    for (const part of ["priya", "98765", "eyJzdWIi", "AbCdEf123", "ghp_abc", "3f2b1c4d"]) expect(out).not.toContain(part);
  });
  it("caps length", () => expect(scrub("word ".repeat(2_000), 100).length).toBe(100));
  it("handles non-strings", () => { expect(scrub(undefined)).toBe(""); expect(scrub({ a: 1 })).toBe("[object Object]"); });
});

describe("ops: routes and stacks", () => {
  it("collapses ids in routes", () => {
    expect(routeKey("/api/matches/3f2b1c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f/messages?x=1")).toBe("/api/matches/:id/messages");
    expect(routeKey("/api/people/abcdefghijklmnopqrstuvwx")).toBe("/api/people/:id");
    expect(routeKey("/api/ads/campaigns/123/stats")).toBe("/api/ads/campaigns/:id/stats");
    expect(routeKey("/api/discovery")).toBe("/api/discovery");
  });
  it("keeps only project-relative frames", () => {
    const st = stackTop("TypeError: x\n    at fn (/home/runner/work/project-connect/project-connect/src/lib/discover.ts:10:5)\n    at other (/srv/app/.next/server/chunk.js:1:2)");
    expect(st[0]).toContain("src/lib/discover.ts:10:5");
    expect(st.join(" ")).not.toContain("/home/runner");
  });
});

describe("ops: fingerprints group the same problem", () => {
  it("ignores numbers, quoted values and ids", () => {
    const a = fingerprint("SERVER_ERROR", "GET /api/x", "Row 12 not found for 'alice'");
    const b = fingerprint("SERVER_ERROR", "GET /api/x", "Row 9871 not found for 'bob'");
    expect(a).toBe(b);
  });
  it("separates different routes and kinds", () => {
    const base = fingerprint("SERVER_ERROR", "GET /api/x", "boom");
    expect(fingerprint("SERVER_ERROR", "GET /api/y", "boom")).not.toBe(base);
    expect(fingerprint("CLIENT_ERROR", "GET /api/x", "boom")).not.toBe(base);
  });
});

describe("ops: severity and risk policy", () => {
  it("security and uptime are critical; payments high", () => {
    expect(severityFor("SECURITY", "x")).toBe("CRITICAL");
    expect(severityFor("UPTIME", "x")).toBe("CRITICAL");
    expect(severityFor("PAYMENT", "x")).toBe("HIGH");
    expect(severityFor("SERVER_ERROR", "POST /api/billing/checkout")).toBe("HIGH");
    expect(severityFor("SERVER_ERROR", "GET /api/legal")).toBe("MEDIUM");
    expect(severityFor("SERVER_ERROR", "x", "LOW")).toBe("LOW");
  });
  it("sensitive areas and reach raise the score; stays within 0–100", () => {
    expect(riskScore("LOW", "GET /api/legal")).toBe(10);
    expect(riskScore("LOW", "POST /api/auth/login")).toBe(25);
    expect(riskScore("MEDIUM", "GET /api/x", 12, 150)).toBe(50);
    expect(riskScore("CRITICAL", "POST /api/admin/users", 50, 500)).toBe(100);
  });
  it.each([[0, "Low"], [20, "Low"], [21, "Medium"], [50, "Medium"], [51, "High"], [80, "High"], [81, "Critical"], [100, "Critical"]])("risk %i is %s", (r, band) => expect(riskBand(r)).toBe(band));
  it("a sign-in bug is never auto-fixable (always at least Medium)", () => {
    for (const sev of ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const) expect(riskScore(sev, "POST /api/auth/login")).toBeGreaterThan(20);
  });
});

describe("ops: latency percentiles", () => {
  it("is 0 with no data", () => expect(percentile(OPS_BANDS.map(() => 0), 0.95)).toBe(0));
  it("lands in the right band", () => {
    const h = OPS_BANDS.map(() => 0); h[0] = 90; h[3] = 10; // 90 fast, 10 in 500–1000 ms
    const p = percentile(h, 0.95);
    expect(p).toBeGreaterThanOrEqual(500); expect(p).toBeLessThanOrEqual(1000);
    expect(percentile(h, 0.5)).toBeLessThan(100);
  });
  it("is monotonic in p", () => {
    const h = [5, 10, 20, 30, 20, 10, 5];
    let last = 0;
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]) { const v = percentile(h, p); expect(v).toBeGreaterThanOrEqual(last); last = v; }
  });
  it("buckets are 5-minute UTC windows", () => {
    expect(bucketOf(new Date("2026-11-03T08:07:59Z"))).toBe("2026-11-03T08:05");
    expect(bucketOf(new Date("2026-11-03T23:59:00Z"))).toBe("2026-11-03T23:55");
  });
});
