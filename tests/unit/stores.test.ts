// Store purchase verification. Apple's real root certificate can't sign test data, so this builds a
// test chain shaped like Apple's (root → intermediate → leaf, with Apple's certificate markers) and checks
// that our verifier accepts genuine-looking signed transactions and rejects tampered or foreign ones.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { importPKCS8, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { accountTokenFor, decodeGoogleNotification, verifyAppleTransaction } from "../../src/lib/payments/stores";

const dir = mkdtempSync(path.join(tmpdir(), "pc-apple-"));
const ssl = (...a: string[]) => execFileSync("openssl", a, { cwd: dir, stdio: "pipe" });
const der = (pem: string) => readFileSync(path.join(dir, pem), "utf8").replace(/-----[^-]+-----|\s/g, "");

let leafKey: CryptoKey;
let chain: string[];
let otherChain: string[];
const BUNDLE = "in.example.connect";

function makeChain(prefix: string) {
  ssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", `${prefix}root.key`);
  ssl("req", "-x509", "-new", "-key", `${prefix}root.key`, "-subj", `/CN=${prefix} Test Root`, "-days", "30", "-out", `${prefix}root.pem`,
    "-addext", "basicConstraints=critical,CA:true", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
  writeFileSync(path.join(dir, `${prefix}int.ext`), "basicConstraints=critical,CA:true,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\n1.2.840.113635.100.6.2.1=ASN1:NULL\n");
  ssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", `${prefix}int.key`);
  ssl("req", "-new", "-key", `${prefix}int.key`, "-subj", `/CN=${prefix} Test Intermediate`, "-out", `${prefix}int.csr`);
  ssl("x509", "-req", "-in", `${prefix}int.csr`, "-CA", `${prefix}root.pem`, "-CAkey", `${prefix}root.key`, "-CAcreateserial", "-days", "30", "-extfile", `${prefix}int.ext`, "-out", `${prefix}int.pem`);
  writeFileSync(path.join(dir, `${prefix}leaf.ext`), "basicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature\n1.2.840.113635.100.6.11.1=ASN1:NULL\n");
  ssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", `${prefix}leaf.ec`);
  ssl("pkcs8", "-topk8", "-nocrypt", "-in", `${prefix}leaf.ec`, "-out", `${prefix}leaf.key`);
  ssl("req", "-new", "-key", `${prefix}leaf.key`, "-subj", `/CN=${prefix} Test Leaf`, "-out", `${prefix}leaf.csr`);
  ssl("x509", "-req", "-in", `${prefix}leaf.csr`, "-CA", `${prefix}int.pem`, "-CAkey", `${prefix}int.key`, "-CAcreateserial", "-days", "30", "-extfile", `${prefix}leaf.ext`, "-out", `${prefix}leaf.pem`);
  return [der(`${prefix}leaf.pem`), der(`${prefix}int.pem`), der(`${prefix}root.pem`)];
}

const sign = (payload: object, x5c = chain, key = leafKey) =>
  new SignJWT(payload as Record<string, unknown>).setProtectedHeader({ alg: "ES256", x5c }).sign(key);

const tx = (o: object = {}) => ({
  transactionId: "2000000111", originalTransactionId: "2000000100", bundleId: BUNDLE, productId: "premium_men_12m",
  purchaseDate: Date.now() - 1000, originalPurchaseDate: Date.now() - 1000, expiresDate: Date.now() + 365 * 86_400_000,
  type: "Auto-Renewable Subscription", inAppOwnershipType: "PURCHASED", signedDate: Date.now(), environment: "Sandbox",
  appAccountToken: "6f1c2b9e-3d4a-4f5b-8c6d-7e8f9a0b1c2d", price: 1_000_000, currency: "INR", transactionReason: "PURCHASE",
  storefront: "IND", storefrontId: "143467", ...o,
});

beforeAll(async () => {
  chain = makeChain("a");
  otherChain = makeChain("b");
  leafKey = await importPKCS8(readFileSync(path.join(dir, "aleaf.key"), "utf8"), "ES256") as CryptoKey;
  process.env.APPLE_BUNDLE_ID = BUNDLE;
  process.env.APPLE_ROOT_CERTS_B64 = chain[2];
  process.env.APPLE_ROOT_CERTS_DIR = path.join(dir, "none");
  process.env.APPLE_ONLINE_CHECKS = "false";
}, 30_000);

describe("App Store purchase verification", () => {
  it("accepts a correctly signed subscription and reads it", async () => {
    const s = await verifyAppleTransaction(await sign(tx()));
    expect(s).toMatchObject({ store: "APPLE", ref: "2000000100", productId: "premium_men_12m", transactionId: "2000000111", status: "ACTIVE", amountMinor: 100000, currency: "INR" });
    expect(s.accountToken).toBe("6f1c2b9e-3d4a-4f5b-8c6d-7e8f9a0b1c2d");
  });
  it("rejects a transaction whose contents were changed after signing", async () => {
    const [h, , sig] = (await sign(tx())).split(".");
    const forged = Buffer.from(JSON.stringify(tx({ productId: "vip_12m" }))).toString("base64url");
    await expect(verifyAppleTransaction(`${h}.${forged}.${sig}`)).rejects.toMatchObject({ code: "store_invalid" });
  });
  it("rejects a transaction signed by a certificate that doesn't chain to the trusted root", async () => {
    const otherKey = await importPKCS8(readFileSync(path.join(dir, "bleaf.key"), "utf8"), "ES256") as CryptoKey;
    await expect(verifyAppleTransaction(await sign(tx(), otherChain, otherKey))).rejects.toMatchObject({ code: "store_invalid" });
  });
  it("rejects another app's purchase", async () => {
    await expect(verifyAppleTransaction(await sign(tx({ bundleId: "com.someone.else" })))).rejects.toMatchObject({ code: "store_invalid" });
  });
  it("marks a refunded purchase as revoked", async () => {
    expect((await verifyAppleTransaction(await sign(tx({ revocationDate: Date.now(), revocationReason: 0 })))).status).toBe("REVOKED");
  });
  it("marks a lapsed subscription as expired", async () => {
    expect((await verifyAppleTransaction(await sign(tx({ expiresDate: Date.now() - 1000 })))).status).toBe("EXPIRED");
  });
});

describe("store account tokens and notifications", () => {
  it("ties purchases to an account without exposing it to Google", () => {
    const id = "6F1C2B9E-3D4A-4F5B-8C6D-7E8F9A0B1C2D";
    expect(accountTokenFor("APPLE", id)).toBe(id.toLowerCase());
    expect(accountTokenFor("GOOGLE", id)).toMatch(/^[0-9a-f]{64}$/);
    expect(accountTokenFor("GOOGLE", id)).not.toContain("6f1c2b9e");
  });
  it("reads the purchase token out of a Play notification", () => {
    const data = Buffer.from(JSON.stringify({ subscriptionNotification: { notificationType: 2, purchaseToken: "tok-123" } })).toString("base64");
    expect(decodeGoogleNotification({ message: { data, messageId: "m1" } })).toEqual({ id: "m1", type: "SUB_2", purchaseToken: "tok-123" });
  });
});
