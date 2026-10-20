// Renames the app everywhere people see it: npm run brand:rename -- "Old Name" "New Name"
// Changes visible text only (site, app, emails, invoices, legal placeholders, docs). It never touches
// internal identifiers — the encryption salt, Render service name, bundle ids or database values —
// because changing those would break existing data and builds.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const [from, to] = process.argv.slice(2);
if (!from || !to) { console.error('Usage: npm run brand:rename -- "Old Name" "New Name"'); process.exit(1); }
const ROOTS = ["src", "mobile/src", "mobile/public", "scripts", "docs", "README.md", "mobile/app.json"];
const SKIP = /node_modules|\.next|public\/app|\.git|rename-brand\.ts/;
const EXT = /\.(ts|tsx|js|mjs|json|md|html)$/;
let files = 0, hits = 0;
function walk(p: string) {
  if (SKIP.test(p)) return;
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isDirectory()) return readdirSync(p).forEach((f) => walk(path.join(p, f)));
  if (!EXT.test(p)) return;
  const s = readFileSync(p, "utf8");
  const n = s.split(from).length - 1;
  if (!n) return;
  writeFileSync(p, s.split(from).join(to));
  files++; hits += n;
}
ROOTS.forEach(walk);
console.log(`Replaced "${from}" with "${to}" ${hits} times in ${files} files. Rebuild the app (npm run build:app-web) and redeploy.`);
