import { describe, expect, it } from "vitest";
import { URGENCY } from "../../src/lib/admin-billing";
import sharp from "sharp";
import { decide, decideLocal } from "../../src/lib/photoScreen";
import { scanLocally } from "../../src/lib/vision";

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

describe("on-server photo check", () => {
  it("decides from the model's classes; swimwear-style 'Sexy' is allowed", () => {
    expect(decideLocal({ Porn: 0.95, Neutral: 0.02 }).status).toBe("REJECTED");
    expect(decideLocal({ Hentai: 0.4, Drawing: 0.5 }).status).toBe("PENDING");
    expect(decideLocal({ Sexy: 0.9, Neutral: 0.08, Porn: 0.02 }).status).toBe("LIVE");
  });
  it("runs the model in its own process and passes an ordinary photo", async () => {
    const img = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 120, g: 160, b: 200 } } }).jpeg().toBuffer();
    const scores = await scanLocally(img, 60_000);
    expect(scores).not.toBeNull();
    expect(Object.keys(scores!).sort()).toEqual(["Drawing", "Hentai", "Neutral", "Porn", "Sexy"]);
    expect(decideLocal(scores!).status).toBe("LIVE");
  }, 90_000);
});
