// Call relay settings handed to the apps. Cloudflare's API is simulated (it isn't reachable from tests).
import { afterEach, describe, expect, it, vi } from "vitest";
import { callsConfigured, iceConfig } from "../../src/lib/calls";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });
const clear = () => { for (const k of ["CLOUDFLARE_TURN_KEY_ID", "CLOUDFLARE_TURN_API_TOKEN", "TURN_URLS", "TURN_SECRET", "CALLS_ALLOW_DIRECT"]) delete process.env[k]; };

describe("call relay", () => {
  it("is off with no relay configured", async () => {
    clear();
    expect(callsConfigured()).toBe(false);
    expect(await iceConfig("u1")).toBeNull();
  });
  it("uses Cloudflare credentials, relay-only, without STUN or blocked port 53", async () => {
    clear();
    process.env.CLOUDFLARE_TURN_KEY_ID = "key123"; process.env.CLOUDFLARE_TURN_API_TOKEN = "tok";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ iceServers: [
      { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
      { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" },
    ] }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(callsConfigured()).toBe(true);
    const ice = await iceConfig("u1");
    expect(ice).toEqual({ iceTransportPolicy: "relay", relay: true, iceServers: [{ urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" }] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rtc.live.cloudflare.com/v1/turn/keys/key123/credentials/generate-ice-servers");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.stringify(ice)).not.toContain("tok");
  });
  it("turns calls off (not direct) if Cloudflare fails", async () => {
    clear();
    process.env.CLOUDFLARE_TURN_KEY_ID = "key123"; process.env.CLOUDFLARE_TURN_API_TOKEN = "bad";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect(await iceConfig("u1")).toBeNull();
  });
  it("makes short-lived coturn credentials from a shared secret", async () => {
    clear();
    process.env.TURN_URLS = "turn:t.example.com:3478"; process.env.TURN_SECRET = "s3cret";
    const ice = await iceConfig("u1");
    expect(ice?.relay).toBe(true);
    expect(ice?.iceServers[0].username).toMatch(/^\d+:[0-9a-f]{16}$/);
    expect(JSON.stringify(ice)).not.toContain("s3cret");
  });
});
