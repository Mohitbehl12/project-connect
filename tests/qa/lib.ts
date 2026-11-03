// Shared helpers for the QA campaign (tests/qa). Every check is one numbered "case" with a pass/fail result,
// written to qa-results/<suite>.json so the report can count them.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BASE = process.env.BASE_URL ?? "http://localhost:3000";
export const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? "admin@projectconnect.local", password: process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026" };
export const RUN = Date.now().toString(36);

export type Case = { id: string; suite: string; area: string; name: string; ok: boolean; detail?: string; ms?: number };
const cases: Case[] = [];
let n = 0;

export function record(suite: string, area: string, name: string, ok: boolean, detail?: unknown, ms?: number) {
  n++;
  const c: Case = { id: `${suite}-${String(n).padStart(4, "0")}`, suite, area, name, ok: !!ok, ms };
  if (!ok && detail !== undefined) c.detail = (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500);
  cases.push(c);
  if (!ok) console.log(`  ✗ [${area}] ${name}  ${c.detail ?? ""}`);
  return !!ok;
}

export function save(suite: string) {
  mkdirSync("qa-results", { recursive: true });
  writeFileSync(join("qa-results", `${suite}.json`), JSON.stringify(cases, null, 1));
  const failed = cases.filter((c) => !c.ok);
  const areas = [...new Set(cases.map((c) => c.area))];
  console.log(`\n${suite}: ${cases.length} cases, ${cases.length - failed.length} passed, ${failed.length} failed`);
  for (const a of areas) {
    const in_ = cases.filter((c) => c.area === a);
    console.log(`  ${a.padEnd(34)} ${String(in_.length).padStart(4)} cases  ${in_.filter((c) => !c.ok).length} failed`);
  }
  return failed.length;
}

export class Client {
  cookie = "";
  constructor(public name: string, public ip = `10.${(name.length * 7) % 250}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`) {}
  async raw(method: string, path: string, body?: string | FormData, headers: Record<string, string> = {}) {
    const t = Date.now();
    const res = await fetch(BASE + path, {
      method, redirect: "manual",
      headers: { ...(typeof body === "string" ? { "content-type": "application/json" } : {}), cookie: this.cookie, "x-forwarded-for": this.ip, ...headers },
      body: method === "GET" || method === "HEAD" ? undefined : body,
    });
    const set = res.headers.get("set-cookie");
    if (set && set.startsWith("pc_session=")) this.cookie = set.split(";")[0];
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, text, headers: res.headers, ms: Date.now() - t };
  }
  call(method: string, path: string, body?: unknown) { return this.raw(method, path, body === undefined ? undefined : JSON.stringify(body)); }
  get = (p: string) => this.call("GET", p);
  post = (p: string, b: unknown = {}) => this.call("POST", p, b);
  put = (p: string, b: unknown) => this.call("PUT", p, b);
  patch = (p: string, b: unknown) => this.call("PATCH", p, b);
  del = (p: string, b: unknown = {}) => this.call("DELETE", p, b);
  login(email: string, password: string) { return this.post("/api/auth/login", { email, password }); }
}

/** Every API route on disk with its exported methods; [params] become a random-looking id. */
export function routes() {
  const out: { path: string; template: string; methods: string[] }[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "route.ts") {
        const src = readFileSync(p, "utf8");
        const methods = [...src.matchAll(/export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
        const template = dir.replace(/^src\/app/, "");
        out.push({ template, methods, path: template.replace(/\[\.\.\.(\w+)\]/g, "x/y").replace(/\[(\w+)\]/g, "00000000-0000-4000-8000-000000000000") });
      }
    }
  };
  walk("src/app/api");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export const PUBLIC = [/^\/api\/auth\//, /^\/api\/legal\//, /^\/api\/public\//, /^\/api\/health/, /^\/api\/privacy\/retention/, /^\/api\/grievances/, /^\/api\/appeals/,
  /^\/api\/billing\/(confirm|mock|pay|invoices|payments)/, /^\/api\/webhooks\//, /^\/api\/cron\//, /^\/api\/media\//, /^\/api\/plans/, /^\/api\/ads\/(register|meta|events|click|convert|home)$/];
export const ADVERTISER_ALLOWED = /^\/api\/(ads|auth|me|notifications|security|consents|legal)(\/|$)/;

/** Full member set-up (email + phone verified, profile, preferences, personality). Returns the user id. */
export async function onboard(c: Client, o: { email: string; gender: string; seeking: string[]; name: string; city?: string; dob?: string; interests?: string[]; intent?: string }) {
  const reg = await c.post("/api/auth/register", { email: o.email, password: "Testing123", dob: o.dob ?? "1995-06-15", acceptLegal: true, confirmAdult: true, safetyAcknowledged: true });
  if (reg.status !== 201) throw new Error(`register ${o.email}: ${reg.status} ${reg.text.slice(0, 200)}`);
  await c.post("/api/auth/otp", { action: "verify", channel: "EMAIL", code: reg.data.devOtp });
  const ps = await c.post("/api/auth/otp", { action: "send", channel: "PHONE", phone: `+91${String(Date.now()).slice(-6)}${String(Math.floor(Math.random() * 9000) + 1000)}` });
  await c.post("/api/auth/otp", { action: "verify", channel: "PHONE", code: ps.data?.devOtp });
  const prof = await c.put("/api/profile", {
    firstName: o.name, gender: o.gender, city: o.city ?? "Delhi", intent: o.intent ?? "LONG_TERM",
    bio: "QA account. Loves chai, long walks and a good book on Sunday mornings.", education: "Bachelor's degree", profession: "QA analyst",
    heightCm: 168, drinking: "SOCIAL", smoking: "NEVER", food: "VEG", exercise: "SOMETIMES", pets: "WANTS",
    interests: o.interests ?? ["coffee", "travel", "reading"], prompts: [{ q: "A perfect first date for me is", a: "a slow walk and good chai" }],
  });
  if (prof.status !== 200) throw new Error(`profile ${o.email}: ${prof.status} ${prof.text.slice(0, 200)}`);
  await c.put("/api/preferences", { interestedIn: o.seeking, ageMin: 21, ageMax: 45, maxDistanceKm: 100, intents: [] });
  await c.put("/api/personality", { answers: { energy: 3, planning: 3, sharing: 3, conflict: 3, pace: 3, texting: 3, ambition: 3, novelty: 3, family: 3, affection: 3 } });
  return reg.data.id as string;
}

/** Small seeded random generator so a failing case can be replayed. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
