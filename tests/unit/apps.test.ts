import { describe, expect, it } from "vitest";
import { appConfigFor, asPlatform, compareVersions } from "../../src/lib/appReleases";

describe("versions", () => {
  it.each([["1.0.0", "1.0.0", 0], ["1.10.0", "1.9.3", 1], ["1.2", "1.2.0", 0], ["2.0.0", "10.0.0", -1], ["1.0.1", "1.0.0", 1], ["abc", "0.0.0", 0]])("%s vs %s", (a, b, want) => expect(compareVersions(a, b)).toBe(want));
});

describe("each platform is released separately", () => {
  const all = {
    ios: { minVersion: "1.2.0", latestVersion: "1.3.0", storeUrl: "https://apps.apple.com/app/id1", message: "", features: { calls: false } },
    android: { minVersion: "1.0.0", latestVersion: "1.0.0", storeUrl: "", message: "", features: {} },
  };
  it("iPhone below the minimum must update; Android at the same version doesn't", () => {
    expect(appConfigFor(all, "ios", "1.1.0").updateRequired).toBe(true);
    expect(appConfigFor(all, "android", "1.1.0").updateRequired).toBe(false);
  });
  it("between minimum and latest: update available, not required", () => {
    const c = appConfigFor(all, "ios", "1.2.5");
    expect([c.updateRequired, c.updateAvailable]).toEqual([false, true]);
  });
  it("a feature switched off on iPhone stays on for Android and web", () => {
    expect(appConfigFor(all, "ios", "1.3.0").features.calls).toBe(false);
    expect(appConfigFor(all, "android", "1.3.0").features.calls).toBe(true);
    expect(appConfigFor(all, "web", null).features.calls).toBe(true);
  });
  it("the web app and unknown versions never get an update prompt", () => {
    expect(appConfigFor(all, "web", "0.1.0").updateRequired).toBe(false);
    expect(appConfigFor(all, "ios", null).updateRequired).toBe(false);
    expect(appConfigFor(all, "ios", "<script>").updateRequired).toBe(false);
  });
  it("unknown platform headers count as web", () => { expect(asPlatform("windows")).toBe("web"); expect(asPlatform("ios")).toBe("ios"); });
});
