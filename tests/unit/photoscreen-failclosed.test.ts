import { afterEach, describe, expect, it, vi } from "vitest";

let mode: "auto" | "review" | "off" = "auto";
vi.mock("../../src/lib/config", () => ({ getConfig: async () => mode }));
vi.mock("../../src/lib/vision", () => ({ localScanEnabled: () => false, scanLocally: async () => null }));

import { screenPhoto } from "../../src/lib/photoScreen";

const img = Buffer.from("not a real image; no scanner runs in these cases");
const env = (v: string | undefined) => { if (v === undefined) vi.stubEnv("NODE_ENV", undefined as unknown as string); else vi.stubEnv("NODE_ENV", v); };

afterEach(() => { vi.unstubAllEnvs(); mode = "auto"; });

describe("photo screening fails closed", () => {
  it("with no scanner, a real server holds every photo for a person", async () => {
    env("production");
    expect((await screenPhoto(img)).status).toBe("PENDING");
  });
  it("an unset or unknown environment is treated as a real server", async () => {
    env(undefined);
    expect((await screenPhoto(img)).status).toBe("PENDING");
    env("staging");
    expect((await screenPhoto(img)).status).toBe("PENDING");
  });
  it("the 'off' setting cannot publish an unchecked photo on a real server", async () => {
    mode = "off";
    env("production");
    expect((await screenPhoto(img)).status).toBe("PENDING");
    env(undefined);
    expect((await screenPhoto(img)).status).toBe("PENDING");
  });
  it("development and test machines still publish straight away", async () => {
    env("development");
    expect((await screenPhoto(img)).status).toBe("LIVE");
    mode = "off";
    env("test");
    expect((await screenPhoto(img)).status).toBe("LIVE");
  });
});
