import { describe, expect, it } from "vitest";
import { isRenameOnly } from "../../scripts/legal-drafts";

describe("legal drafts: republish when only the app name changed", () => {
  const draft = "# Terms\n\nTwofold is for adults. Using Twofold means you accept these terms.";
  it("matches an older draft that used a previous name", () => {
    for (const old of ["Kinara", "Discover", "TwoFold", "Project Connect"]) expect(isRenameOnly(draft.split("Twofold").join(old), draft)).toBe(true);
  });
  it("ignores identical text", () => expect(isRenameOnly(draft, draft)).toBe(false));
  it("never replaces text someone edited", () => {
    expect(isRenameOnly(draft.replace("adults", "adults over 21").split("Twofold").join("Discover"), draft)).toBe(false);
  });
});
