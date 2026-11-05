import { describe, expect, it } from "vitest";
import { SAME_PHOTO_BITS, bands, dhashFromGrey, hamming } from "../../src/lib/photoHash";

const grad = (f: (r: number, c: number) => number) => Array.from({ length: 72 }, (_, i) => f(Math.floor(i / 9), i % 9));

describe("duplicate-photo hash", () => {
  it("is 16 hex chars and stable", () => {
    const h = dhashFromGrey(grad((r, c) => (r * 31 + c * 17) % 256));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(dhashFromGrey(grad((r, c) => (r * 31 + c * 17) % 256))).toBe(h);
  });
  it("treats a brighter copy of the same picture as the same", () => {
    const a = grad((r, c) => (r * 31 + c * 17) % 200);
    const b = a.map((v) => v + 40); // uniformly brighter: relative order unchanged
    expect(hamming(dhashFromGrey(a), dhashFromGrey(b))).toBe(0);
  });
  it("tells different pictures apart", () => {
    const a = dhashFromGrey(grad((r, c) => c * 20));
    const b = dhashFromGrey(grad((r, c) => 200 - c * 20));
    expect(hamming(a, b)).toBeGreaterThan(SAME_PHOTO_BITS);
  });
  it("counts bits and shares a band when close (pigeonhole)", () => {
    expect(hamming("0000000000000000", "0000000000000007")).toBe(3);
    const a = "0123456789abcdef", b = "0123456789abcdec"; // 2 bits apart
    expect(bands(a).some((x, i) => x === bands(b)[i])).toBe(true);
  });
});
