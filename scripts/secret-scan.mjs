// Fails if a tracked file looks like it contains a real credential. High-confidence patterns only, so it is
// quiet on test fixtures and docs. Run: node scripts/secret-scan.mjs  (CI runs it on every PR).
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const PATTERNS = [
  ["Razorpay live key", /rzp_live_[A-Za-z0-9]{10,}/],
  ["Stripe live key", /\b[sr]k_live_[A-Za-z0-9]{16,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/],
  ["Slack token / webhook", /xox[baprs]-[A-Za-z0-9-]{10,}|hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}/],
  ["Resend key", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
  ["Render API key", /\brnd_[A-Za-z0-9]{20,}/],
  ["Expo token", /\bexpo_[A-Za-z0-9_-]{30,}/],
  ["Private key", /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
];
const files = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter((f) => f && !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp4|zip|pdf|lock)$/i.test(f) && !f.endsWith("package-lock.json"));
const hits = [];
for (const f of files) {
  let s;
  try { if (statSync(f).size > 2_000_000) continue; s = readFileSync(f, "utf8"); } catch { continue; }
  if (/^\.env($|\.)/.test(f.split("/").pop()) && !f.endsWith(".example")) hits.push([f, 0, "a .env file is committed"]);
  s.split("\n").forEach((line, i) => { for (const [name, re] of PATTERNS) if (re.test(line)) hits.push([f, i + 1, name]); });
}
for (const [f, l, n] of hits) console.error(`::error file=${f},line=${l}::Possible secret (${n}) — remove it and rotate the key.`);
if (hits.length) { console.error(`${hits.length} possible secret(s) found.`); process.exit(1); }
console.log(`Secret scan: ${files.length} files, nothing found.`);
