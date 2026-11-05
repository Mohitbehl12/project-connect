// QA campaign, real-user journeys in the app (web build): sign up, every onboarding step, first like,
// settings and sign-out — tapping and typing like a person would. Each step is one case.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { BASE, RUN, record, save } from "./lib";

const S = "journey";
const { chromium } = createRequire(import.meta.url)(process.env.PW_MODULE ?? "playwright");
const SHOTS = process.env.QA_SHOTS ?? "qa-results/shots";
mkdirSync(SHOTS, { recursive: true });

type P = { name: string; gender: "Woman" | "Man" | "Non-binary"; city: string; showMe: string[]; goal: string; mode: "DARK" | "LIGHT"; w: number; h: number; dob: [string, string, string] };
const PEOPLE: P[] = [
  { name: "Ananya", gender: "Woman", city: "Mumbai", showMe: ["Man"], goal: "A relationship", mode: "DARK", w: 390, h: 844, dob: ["14", "02", "1997"] },
  { name: "Vikram", gender: "Man", city: "Bengaluru", showMe: ["Woman"], goal: "Dating", mode: "LIGHT", w: 390, h: 844, dob: ["03", "11", "1993"] },
  { name: "Sam", gender: "Non-binary", city: "London", showMe: ["Woman", "Man", "Non-binary"], goal: "New connections", mode: "DARK", w: 320, h: 640, dob: ["29", "02", "2000"] },
];

async function journey(browser: any, p: P, i: number) {
  const area = `Sign-up to first like: ${p.name} (${p.gender.toLowerCase()}, ${p.city}, ${p.mode.toLowerCase()}, ${p.w}px)`;
  const ctx = await browser.newContext({ viewport: { width: p.w, height: p.h } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message.slice(0, 160)));
  const navs: string[] = [];
  page.on("framenavigated", (f: any) => { if (f === page.mainFrame()) navs.push(f.url().replace(BASE, "")); });
  const email = `qa-ui${i}-${RUN}@test.local`;
  let stepNo = 0, broken = false;
  page.setDefaultTimeout(8000);
  // After one step fails the rest of that journey can't be trusted, so it stops (one failure, not a cascade).
  const step = async (name: string, fn: () => Promise<unknown>, expect?: RegExp) => {
    if (broken) return false;
    stepNo++;
    try {
      await fn();
      await page.waitForTimeout(900);
      if (expect) await page.getByText(expect).first().waitFor({ timeout: 8000 });
      const errs = errors.splice(0);
      return record(S, area, `${stepNo}. ${name}`, errs.length === 0, errs);
    } catch (e) {
      await page.screenshot({ path: `${SHOTS}/journey-${i}-${stepNo}.png` }).catch(() => {});
      broken = true;
      return record(S, area, `${stepNo}. ${name}`, false, `${String(e).split("\n")[0].slice(0, 200)} | last pages: ${navs.slice(-5).join(" → ")}`);
    }
  };
  const btn = (name: RegExp | string) => page.getByRole("button", { name }).last();
  await page.goto(BASE + "/app/welcome");
  await page.evaluate((m: string) => localStorage.setItem("kn.mode", m), p.mode);
  await step("welcome screen loads", async () => { await page.reload(); }, /./);
  await step("open sign-up", async () => { await page.goto(BASE + "/app/sign-up"); }, /Email/);
  await step("a weak password keeps Continue disabled", async () => {
    await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill("short");
    if (!(await btn("Continue").isDisabled())) throw new Error("Continue was enabled with a weak password");
  });
  await step("email and a good password → Continue", async () => { await page.getByLabel("Password").fill("Testing123"); await btn("Continue").click(); }, /Day|birthday|born/i);
  await step("an under-18 birthday is refused", async () => {
    await page.getByLabel("Day").fill("01"); await page.getByLabel("Month").fill("01"); await page.getByLabel("Year").fill(String(new Date().getFullYear() - 16));
    await page.getByText(/only for people aged 18/).first().waitFor({ timeout: 4000 });
  });
  await step("a real birthday shows the age", async () => {
    await page.getByLabel("Day").fill(p.dob[0]); await page.getByLabel("Month").fill(p.dob[1]); await page.getByLabel("Year").fill(p.dob[2]);
  }, /You're \d+/);
  await step("Continue to the promises", async () => { await btn("Continue").click(); }, /A few promises/);
  await step("Create account stays disabled until all three promises are ticked", async () => { if (!(await btn("Create account").isDisabled())) throw new Error("enabled too early"); });
  await step("tick the promises and create the account", async () => {
    const boxes = page.getByRole("checkbox");
    // Tap the tick-box itself: the sentence next to it contains links to the documents.
    for (let k = 0; k < 3; k++) await boxes.nth(k).click({ position: { x: 14, y: 16 } });
    await btn("Create account").click();
  }, /code|verify|Let's make your profile|email/i);
  // Email code step (if shown) — the dev server returns the code in the API, so read it from the test hook.
  if (await page.getByText(/Let's make your profile/).count() === 0) {
    await step("enter the email code", async () => {
      const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email, password: "Testing123" }) });
      const ck = r.headers.get("set-cookie")?.split(";")[0] ?? "";
      const sent = await (await fetch(`${BASE}/api/auth/otp`, { method: "POST", headers: { "content-type": "application/json", cookie: ck, origin: BASE }, body: JSON.stringify({ action: "send", channel: "EMAIL" }) })).json();
      const code = sent.devOtp as string;
      const field = page.getByLabel(/code/i).first();
      await field.fill(code);
      const go = page.getByRole("button", { name: /verify|continue|confirm/i }).last();
      if (await go.count()) await go.click();
    }, /Let's make your profile/);
  }
  await step("type a first name and choose a gender", async () => { await page.getByLabel("First name").fill(p.name); await page.getByRole("button", { name: p.gender, exact: true }).first().click(); await btn("Continue").click(); }, /Where are you based/);
  await step(`search for ${p.city} and pick it`, async () => { await page.getByLabel(/Search (cities|any town or city)/).fill(p.city.slice(0, 4)); await page.getByRole("radio", { name: new RegExp(p.city) }).first().click(); await btn("Continue").click(); });
  await step(`choose "${p.goal}"`, async () => { await page.getByRole("radio", { name: new RegExp(p.goal) }).first().click(); await page.waitForTimeout(400); }, p.goal === "New connections" ? undefined : /pick one/i);
  if (p.goal !== "New connections") await step("Continue tells you to pick an option, then pick one", async () => {
    await page.getByRole("button", { name: "Pick one option above" }).last().waitFor();
    await page.getByRole("button", { name: /Long-term|Marriage|figuring|casual/i }).first().click();
  });
  await step("Continue to interests", async () => { await btn("Continue").click(); }, /interest|Pick \d more/i);
  await step("Continue is blocked until 3 interests are picked", async () => { if (!(await page.getByRole("button", { name: /Pick 3 more/ }).last().isDisabled())) throw new Error("not disabled"); });
  await step("pick three interests", async () => { const boxes = page.getByRole("checkbox"); for (let k = 0; k < 3; k++) await boxes.nth(k).click(); await btn("Continue").click(); }, /About you/);
  for (let q = 0; q < 10; q++) {
    const done = await page.getByText(/Who would you like to meet/).count();
    if (done) break;
    await step(`personality question ${q + 1}: answer it`, async () => {
      const s = page.getByRole("slider").first();
      const box = await s.boundingBox();
      if (!box) throw new Error("no slider");
      await page.mouse.click(box.x + box.width * (0.1 + ((q * 37) % 80) / 100), box.y + box.height / 2);
      await page.waitForTimeout(500);
      const cont = page.getByRole("button", { name: /^Continue$/ }).last();
      if (await cont.count() && await cont.isEnabled()) await cont.click();
      else { const nx = page.getByRole("button", { name: /^Next$/ }).last(); if (await nx.count()) await nx.click().catch(() => {}); }
    });
  }
  await step("reach 'Who would you like to meet?'", async () => {}, /Who would you like to meet/);
  await step(`show me: ${p.showMe.join(", ")}`, async () => {
    for (const g of p.showMe) await page.getByRole("button", { name: g, exact: true }).first().click();
    await btn("Continue").click();
  }, /photo/i);
  await step("skip photos for now", async () => { const later = page.getByRole("button", { name: /add photos later/i }); if (await later.count()) await later.last().click(); else await btn("Continue").click(); }, /verified ring/i);
  await step("skip the selfie check", async () => { await btn("Maybe later").click(); }, /discovering|ready|all set/i);
  if (process.env.DEBUG_SHOTS) await page.screenshot({ path: `${SHOTS}/dbg-ready.png` });
  await step("Start discovering opens Discover", async () => { await page.getByRole("button", { name: /Start discovering/ }).last().click(); if (process.env.DEBUG_SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/dbg-after300.png` }); await page.waitForTimeout(2000); await page.screenshot({ path: `${SHOTS}/dbg-after2300.png` }); } await page.waitForURL(/discover/, { timeout: 10000 }); });
  await page.screenshot({ path: `${SHOTS}/journey-${i}-discover.png` });
  await step("Discover shows people, or a friendly empty state", async () => { await page.waitForTimeout(2500); }, /people you might click with|You've met everyone|caught up|Finding people/);
  await step("like the first person (if there is one)", async () => {
    const like = page.getByRole("button", { name: /^Like / }).first();
    if (await like.count()) { await like.click(); await page.waitForTimeout(1200); }
  });
  await step("open Explore", async () => { await page.getByRole("tab", { name: /Explore/ }).click(); }, /Explore/);
  await step("open search and type", async () => { await page.goto(BASE + "/app/search"); await page.getByLabel("Who are you hoping to discover?").fill("coffee"); }, /Show|people|No one yet/);
  await step("open Matches", async () => { await page.goto(BASE + "/app/matches"); }, /Matches/);
  await step("open Profile", async () => { await page.goto(BASE + "/app/profile"); }, new RegExp(p.name));
  await step("open Settings", async () => { await page.goto(BASE + "/app/settings"); }, /Settings/);
  await step("switch personalised ads off in Privacy Center", async () => {
    await page.goto(BASE + "/app/privacy"); await page.waitForTimeout(2500);
    const sw = page.getByRole("switch", { name: /Personalised ads/ }).first();
    await sw.click(); await page.waitForTimeout(1200);
  });
  await step("sign out", async () => {
    await page.goto(BASE + "/app/settings"); await page.waitForTimeout(2000);
    const out = page.getByRole("button", { name: /sign out|log out/i }).last();
    await out.scrollIntoViewIfNeeded(); await out.click();
    const confirm = page.getByRole("button", { name: /^(sign out|log out)$/i });
    if (await confirm.count() > 1) await confirm.last().click();
  }, /Start Matching|already have an account/i);
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
  try { for (const [i, p] of PEOPLE.entries()) if (!process.env.ONLY || process.env.ONLY === String(i)) await journey(browser, p, i); } finally { await browser.close(); }
  process.exit(save(S) ? 1 : 0);
}
main().catch((e) => { console.error(e); save(S); process.exit(2); });
