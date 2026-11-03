// QA campaign, screens: opens every app screen (both themes, a normal and a small phone) and every website
// page (desktop and phone) in a real browser and checks each one for crashes, console errors, sideways
// scrolling, broken text ("undefined", "NaN", "[object Object]"), broken images and unlabeled buttons.
// Needs Playwright with Chromium (PW_MODULE points at the package; PW_CHROMIUM at the browser).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { ADMIN, BASE, RUN, record, save } from "./lib";

const S = "screens";
const req = createRequire(import.meta.url);
const { chromium } = req(process.env.PW_MODULE ?? "playwright");
const SHOTS = process.env.QA_SHOTS ?? "qa-results/shots";
mkdirSync(SHOTS, { recursive: true });

type Page = any;
async function login(email: string, password: string) {
  const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.1` }, body: JSON.stringify({ email, password }) });
  const ck = r.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { cookie: ck, data: await r.json().catch(() => null) };
}

/** Run every check on the page that's open now. */
async function inspect(page: Page, area: string, label: string, errors: string[], opts: { width: number; allowSpinner?: boolean }) {
  const r = await page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const text = document.body?.innerText ?? "";
    const bad = (text.match(/\b(undefined|NaN)\b|\[object Object\]|Invalid Date/g) ?? []).slice(0, 3);
    const imgs = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:")).map((i) => i.src.slice(-60));
    const unlabeled = [...document.querySelectorAll('button, [role="button"], a[href]')].filter((el) => {
      const h = el as HTMLElement;
      if (!h.offsetParent && getComputedStyle(h).position !== "fixed") return false; // hidden
      const labelled = (h.getAttribute("aria-labelledby") ?? "").split(" ").map((id) => document.getElementById(id)?.innerText ?? "").join("");
      const forLabels = [...((h as HTMLButtonElement).labels ?? [])].map((l) => l.innerText).join("");
      const name = (h.getAttribute("aria-label") ?? "") + (h.innerText ?? "") + (h.getAttribute("title") ?? "") + labelled + forLabels + ((h.querySelector("img[alt]") as HTMLImageElement | null)?.alt ?? "");
      return !name.trim();
    }).length;
    // Sideways scrolling: the page itself must not be wider than the screen (inner carousels may scroll).
    const wide = Math.max(doc.scrollWidth, document.body?.scrollWidth ?? 0) - window.innerWidth;
    const unlabeledWhat = [...document.querySelectorAll('button, [role="button"], a[href]')].filter((el) => {
      const h = el as HTMLElement;
      if (!h.offsetParent && getComputedStyle(h).position !== "fixed") return false;
      const labelled = (h.getAttribute("aria-labelledby") ?? "").split(" ").map((id) => document.getElementById(id)?.innerText ?? "").join("");
      const forLabels = [...((h as HTMLButtonElement).labels ?? [])].map((l) => l.innerText).join("");
      return !((h.getAttribute("aria-label") ?? "") + (h.innerText ?? "") + (h.getAttribute("title") ?? "") + labelled + forLabels + ((h.querySelector("img[alt]") as HTMLImageElement | null)?.alt ?? "")).trim();
    }).slice(0, 3).map((el) => el.outerHTML.slice(0, 140));
    return { bad, imgs, unlabeled, unlabeledWhat, wide, len: text.trim().length };
  });
  const errs = errors.splice(0);
  record(S, area, `${label}: opens without crashing or console errors`, errs.length === 0, errs.slice(0, 3));
  record(S, area, `${label}: no "undefined", "NaN" or "[object Object]" on screen`, r.bad.length === 0, r.bad);
  record(S, area, `${label}: fits the ${opts.width}px screen (no sideways scroll)`, r.wide <= 1, `${r.wide}px too wide`);
  record(S, area, `${label}: every button and link has a name for screen readers`, r.unlabeled === 0, { unlabeled: r.unlabeled, examples: r.unlabeledWhat });
  record(S, area, `${label}: images load and the page isn't blank`, r.imgs.length === 0 && r.len > 20, { broken: r.imgs, textLength: r.len });
}

function watch(page: Page, errors: string[]) {
  page.on("pageerror", (e: Error) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
  page.on("console", (m: any) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Network noise we cause on purpose (401 before sign-in checks, aborted requests on navigation) is not a bug.
    if (/Failed to load resource: the server responded with a status of (401|403|404|409|422)|net::ERR_ABORTED|favicon/.test(t)) return;
    // The test machine can't reach Google Fonts (sandbox network); real visitors can. Not an app bug.
    if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY|ERR_NAME_NOT_RESOLVED/.test(t)) return;
    errors.push(`console: ${t.slice(0, 160)}`);
  });
}

async function appScreens(browser: any) {
  const rohan = await login("rohan@demo.local", "Demo!2026");
  const ms = await (await fetch(BASE + "/api/matches", { headers: { cookie: rohan.cookie } })).json();
  const mid = ms.matches?.[0]?.id, other = ms.matches?.[0]?.other?.id;
  const signedOut = ["welcome", "sign-in", "sign-up", "forgot-password"];
  const signedIn = ["discover", "explore", "matches", "messages", "profile", "likes", "notifications", "settings", "privacy", "safety", "security", "premium", "subscription",
    "referrals", "preferences", "edit-profile", "photos", "calls", "search", "explore/travel", "explore/your-interests", "explore/new", `profile/${other}`, `chat/${mid}`,
    `compatibility/${other}`, `date/${mid}`, `report?userId=${other}&name=Test`, `match?matchId=${mid}&userId=${other}`, "payment-result?status=failed"];
  const sizes: [string, number, number, string[]][] = [["DARK", 390, 844, ["DARK"]], ["LIGHT", 390, 844, ["LIGHT"]], ["SMALL", 320, 640, ["DARK"]]];
  for (const [tag, w, h, [mode]] of sizes) {
    const area = `App screens (${tag === "SMALL" ? "small phone 320px, dark" : `${mode.toLowerCase()} theme`})`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    watch(page, errors);
    await page.goto(BASE + "/app/welcome");
    await page.evaluate((m: string) => { localStorage.setItem("kn.mode", m); }, mode);
    for (const s of signedOut) {
      await page.goto(`${BASE}/app/${s}`); await page.waitForTimeout(2200);
      await inspect(page, area, `/${s}`, errors, { width: w });
    }
    await page.goto(BASE + "/app/sign-in"); await page.waitForTimeout(2000);
    await page.getByLabel(/email/i).first().fill("rohan@demo.local");
    await page.getByLabel(/password/i).first().fill("Demo!2026");
    await page.getByRole("button", { name: /sign in|log in/i }).last().click();
    await page.waitForTimeout(5000);
    errors.splice(0);
    for (const s of signedIn) {
      await page.goto(`${BASE}/app/${s}`); await page.waitForTimeout(3200);
      await inspect(page, area, `/${s.split("?")[0].replace(/[0-9a-f-]{36}/, ":id")}`, errors, { width: w });
      if (tag !== "SMALL") await page.screenshot({ path: `${SHOTS}/app-${mode}-${s.split("?")[0].replace(/[/:]/g, "_").replace(/[0-9a-f-]{36}/, "id")}.png` });
    }
    await ctx.close();
  }
}

async function webPages(browser: any) {
  const pub = ["/", "/about", "/safety", "/contact", "/grievance", "/appeal", "/login", "/register", "/forgot-password", "/advertise", "/advertise/register",
    "/legal/terms", "/legal/privacy", "/legal/guidelines", "/legal/safety", "/legal/payments", "/legal/refunds", "/legal/cookies", "/legal/advertising", "/legal/service-providers"];
  const member = ["/discover", "/likes", "/matches", "/notifications", "/profile", "/settings", "/safety-center", "/plans"];
  const admin = ["/admin", "/admin/reports", "/admin/appeals", "/admin/grievances", "/admin/verification", "/admin/photos", "/admin/users", "/admin/matches", "/admin/calls",
    "/admin/payments", "/admin/offers", "/admin/ads", "/admin/risk", "/admin/legal", "/admin/settings", "/admin/compliance", "/admin/launch", "/admin/audit"];
  const ads = ["/ads", "/ads/new", "/ads/billing", "/ads/account"];
  const rohan = await login("rohan@demo.local", "Demo!2026");
  const adm = await login(ADMIN.email, ADMIN.password);
  const advEmail = `qa-shot-${RUN}@business.test`;
  const reg = await fetch(BASE + "/api/ads/register", { method: "POST", headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": "10.78.1.1" }, body: JSON.stringify({ businessName: `QA Screens ${RUN}`, contactName: "QA", email: advEmail, phone: "+91 90000 22222", category: "FOOD", password: "Business123", acceptTerms: true }) });
  const adv = reg.headers.get("set-cookie")?.split(";")[0] ?? "";
  const groups: [string, string[], string][] = [["Website: public pages", pub, ""], ["Website: member pages", member, rohan.cookie], ["Website: admin pages", admin, adm.cookie], ["Website: advertiser pages", ads, adv]];
  for (const [w, h, tag] of [[1280, 860, "desktop"], [390, 844, "phone"]] as const) {
    for (const [area, paths, cookie] of groups) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      if (cookie) await ctx.addCookies([{ name: "pc_session", value: cookie.split("=")[1], url: BASE }]);
      const page = await ctx.newPage();
      const errors: string[] = [];
      watch(page, errors);
      for (const p of paths) {
        await page.goto(BASE + p); await page.waitForTimeout(p.startsWith("/admin") || p.startsWith("/ads") ? 2600 : 1600);
        await inspect(page, `${area} (${tag})`, p, errors, { width: w });
        if (tag === "desktop") await page.screenshot({ path: `${SHOTS}/web${p.replace(/\//g, "_") || "_home"}.png`, fullPage: false });
      }
      await ctx.close();
    }
  }
}

/** The longest names, bios, prompts and messages the app accepts, on the screens that show them. */
async function stress(browser: any) {
  const { Client, onboard } = await import("./lib");
  const long = "Aleksandra-Wiktoria Margaretha Venkatara".slice(0, 40), long2 = "Bartholomew-Maximilian Chakraborty Iyer".slice(0, 40);
  const W = new Client(`qa-stress-w-${RUN}`), M = new Client(`qa-stress-m-${RUN}`);
  const allInts = ["travel", "coffee", "reading", "films", "gym", "music_live", "cooking", "trekking", "art", "photography"];
  const wid = await onboard(W, { email: `qa-stress-w-${RUN}@test.local`, gender: "WOMAN", seeking: ["MAN"], name: long, interests: allInts });
  const mid_ = await onboard(M, { email: `qa-stress-m-${RUN}@test.local`, gender: "MAN", seeking: ["WOMAN"], name: long2, interests: allInts });
  const big = { bio: ("I love long walks through old Delhi, chai at midnight, and conversations that go on far too long. ").repeat(6).slice(0, 500),
    profession: "Senior Principal Landscape Architect and Urban Design Consultant".slice(0, 80), education: "Master of Architecture in Sustainable Urbanism, School of Planning".slice(0, 80),
    prompts: [{ q: "A perfect first date for me is", a: "x".repeat(0) + "a very long walk ending at a chai stall, then a bookshop, then dinner somewhere with fairy lights and old songs playing softly in the background ".slice(0, 200) },
      { q: "I'm quietly proud of", a: "Supercalifragilisticexpialidociousandevenlongerwordswithoutanyspacesatall".repeat(3).slice(0, 200) },
      { q: "The way to my heart is", a: "मुझे लंबी बातें, अच्छी चाय और पुरानी फिल्में बहुत पसंद हैं — and you should know that too!".slice(0, 200) }] };
  await W.patch("/api/profile", big); await M.patch("/api/profile", big);
  const admin = new Client("qa-stress-admin"); await admin.login(ADMIN.email, ADMIN.password);
  for (const id of [wid, mid_]) await admin.post(`/api/admin/users/${id}`, { action: "VERIFY", reason: "QA stress accounts" });
  await W.post("/api/likes", { toId: mid_, kind: "LIKE" });
  const lk = await M.post("/api/likes", { toId: wid, kind: "LIKE" });
  const matchId = lk.data?.matchId ?? ((await W.get("/api/matches")).data?.matches ?? [])[0]?.id;
  if (matchId) for (const t of ["Hiiiii " + "😂".repeat(40), "https://example.com/" + "a".repeat(150), "W".repeat(300), "नमस्ते! " + "बहुत अच्छा लगा तुमसे बात करके। ".repeat(8)])
    await W.post(`/api/matches/${matchId}/messages`, { body: t, confirmed: true }).then(() => M.post(`/api/matches/${matchId}/messages`, { body: "Haha okay 🙂", confirmed: true }));
  const screens = ["profile", "edit-profile", "matches", "messages", `chat/${matchId}`, `profile/${mid_}`, `compatibility/${mid_}`, `match?matchId=${matchId}&userId=${mid_}`, "explore", "likes"];
  for (const [w, h, label] of [[390, 844, "390px"], [320, 640, "320px"]] as const) {
    const area = `Longest content (app, ${label})`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage(); const errors: string[] = []; watch(page, errors);
    await page.goto(BASE + "/app/sign-in"); await page.waitForTimeout(2000);
    await page.getByLabel(/email/i).first().fill(`qa-stress-w-${RUN}@test.local`); await page.getByLabel(/password/i).first().fill("Testing123");
    await page.getByRole("button", { name: /sign in|log in/i }).last().click(); await page.waitForTimeout(5000); errors.splice(0);
    for (const s2 of screens) {
      await page.goto(`${BASE}/app/${s2}`); await page.waitForTimeout(3200);
      await inspect(page, area, `/${s2.split("?")[0].replace(/[0-9a-f-]{36}/, ":id")}`, errors, { width: w });
      if (w === 390) await page.screenshot({ path: `${SHOTS}/stress-${s2.split("?")[0].replace(/[/:]/g, "_").replace(/[0-9a-f-]{36}/, "id")}.png`, fullPage: true });
    }
    await ctx.close();
    const wctx = await browser.newContext({ viewport: { width: w, height: h } });
    await wctx.addCookies([{ name: "pc_session", value: W.cookie.split("=")[1], url: BASE }]);
    const wp = await wctx.newPage(); const werr: string[] = []; watch(wp, werr);
    for (const p2 of ["/profile", "/matches", `/matches/${matchId}`, "/discover", "/settings"]) {
      await wp.goto(BASE + p2); await wp.waitForTimeout(2200);
      await inspect(wp, `Longest content (website, ${label})`, p2.replace(/[0-9a-f-]{36}/, ":id"), werr, { width: w });
    }
    await wctx.close();
  }
}

/** A brand-new member with no matches, likes, messages or notifications: every screen's empty state. */
async function emptyAccount(browser: any) {
  const { Client, onboard } = await import("./lib");
  const E = new Client(`qa-empty-${RUN}`);
  const email = `qa-empty-${RUN}@test.local`;
  await onboard(E, { email, gender: "NONBINARY", seeking: ["NONBINARY"], name: "Kiran", city: "Jaipur", interests: [] });
  const screens = ["discover", "explore", "matches", "messages", "profile", "likes", "notifications", "settings", "privacy", "safety", "security", "premium", "subscription",
    "referrals", "preferences", "edit-profile", "photos", "calls", "search", "explore/travel", "explore/your-interests", "explore/trending"];
  for (const mode of ["DARK", "LIGHT"]) {
    const area = `Empty new account (${mode.toLowerCase()})`;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errors: string[] = []; watch(page, errors);
    await page.goto(BASE + "/app/sign-in"); await page.evaluate((m: string) => localStorage.setItem("kn.mode", m), mode); await page.reload(); await page.waitForTimeout(2000);
    await page.getByLabel(/email/i).first().fill(email); await page.getByLabel(/password/i).first().fill("Testing123");
    await page.getByRole("button", { name: /sign in|log in/i }).last().click(); await page.waitForTimeout(5000); errors.splice(0);
    for (const s2 of screens) {
      await page.goto(`${BASE}/app/${s2}`); await page.waitForTimeout(3000);
      await inspect(page, area, `/${s2}`, errors, { width: 390 });
      if (mode === "DARK") await page.screenshot({ path: `${SHOTS}/empty-${s2.replace(/\//g, "_")}.png` });
    }
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
  try {
    if (!process.argv[2] || process.argv[2] === "app") await appScreens(browser);
    if (!process.argv[2] || process.argv[2] === "web") await webPages(browser);
    if (!process.argv[2] || process.argv[2] === "stress") await stress(browser);
    if (!process.argv[2] || process.argv[2] === "empty") await emptyAccount(browser);
  } finally { await browser.close(); }
  process.exit(save(S) ? 1 : 0);
}
main().catch((e) => { console.error(e); save(S); process.exit(2); });
